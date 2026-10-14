const MAX_BATCH_SIZE = 500;

export interface BatchLoader<K, V> {
  load(key: K): Promise<V>;
}

interface QueuedKey<K, V> {
  key: K;
  resolve: (value: V) => void;
  reject: (reason: unknown) => void;
}

/**
 * Minimal per-request batcher with a DataLoader-compatible `load`: keys
 * requested in the same tick are deduplicated and resolved by ONE `batchFn`
 * call, which must return values in the same order as the keys.
 *
 * The flush runs on process.nextTick scheduled from a resolved promise, so it
 * fires after every pending microtask hop (e.g. Nest's per-field resolver
 * wrapping) and a whole GraphQL list lands in a single batch. Swap for the
 * `dataloader` package if it becomes installable here; the interface matches.
 */
export function createBatchLoader<K, V>(
  batchFn: (keys: K[]) => Promise<V[]>,
  { maxBatchSize = MAX_BATCH_SIZE }: { maxBatchSize?: number } = {},
): BatchLoader<K, V> {
  const cache = new Map<K, Promise<V>>();
  let queue: QueuedKey<K, V>[] = [];
  const chunkSize = Math.max(1, Math.floor(maxBatchSize) || 1); // <= 0 or NaN would never advance

  /** Keeps every `IN (...)` list far below the database bind-parameter limit. */
  const runInChunks = async (keys: K[]): Promise<V[]> => {
    const chunks: K[][] = [];
    for (let i = 0; i < keys.length; i += chunkSize) {
      chunks.push(keys.slice(i, i + chunkSize));
    }
    const results = await Promise.all(chunks.map((chunk) => batchFn(chunk)));
    return results.flat();
  };

  const flush = async () => {
    const batch = queue;
    queue = [];
    try {
      const values = await runInChunks(batch.map((item) => item.key));
      if (values.length !== batch.length) {
        throw new Error("Batch function must return one value per key");
      }
      batch.forEach((item, index) => item.resolve(values[index]));
    } catch (error) {
      batch.forEach((item) => item.reject(error));
    }
  };

  return {
    load(key: K): Promise<V> {
      const cached = cache.get(key);
      if (cached) return cached;

      const promise = new Promise<V>((resolve, reject) => {
        queue.push({ key, resolve, reject });
        if (queue.length === 1) {
          void Promise.resolve().then(() => process.nextTick(flush));
        }
      });
      cache.set(key, promise);
      return promise;
    },
  };
}
