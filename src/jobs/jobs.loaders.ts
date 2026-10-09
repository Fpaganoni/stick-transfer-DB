import { Injectable } from "@nestjs/common";
import { JobsService } from "./jobs.service";

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

export interface CurrentUserJobLoaders {
  isSaved: BatchLoader<string, boolean>;
  hasApplied: BatchLoader<string, boolean>;
}

/**
 * Per-request loaders for the `*ByCurrentUser` fields of JobOpportunity.
 * Loaders live in a WeakMap keyed by the GraphQL context object (one per
 * request) and then by userId, so nothing is cached across requests or users.
 */
@Injectable()
export class JobsLoaders {
  private readonly byContext = new WeakMap<object, Map<string, CurrentUserJobLoaders>>();

  constructor(private readonly jobsService: JobsService) {}

  forContext(context: object, userId: string): CurrentUserJobLoaders {
    if (typeof context !== "object" || context === null) {
      return this.build(userId);
    }
    const perUser = this.byContext.get(context) ?? new Map<string, CurrentUserJobLoaders>();
    this.byContext.set(context, perUser);

    const existing = perUser.get(userId);
    if (existing) return existing;

    const loaders = this.build(userId);
    perUser.set(userId, loaders);
    return loaders;
  }

  /**
   * Drops the request's cached answers. Mutations that change saved/applied
   * state call this so later fields of the same operation (mutations run in
   * sequence) do not read pre-mutation values.
   */
  reset(context: object): void {
    if (typeof context === "object" && context !== null) {
      this.byContext.delete(context);
    }
  }

  private build(userId: string): CurrentUserJobLoaders {
    return {
      isSaved: createBatchLoader(async (jobIds: string[]) => {
        const saved = await this.jobsService.findSavedJobIds(userId, jobIds);
        return jobIds.map((id) => saved.has(id));
      }),
      hasApplied: createBatchLoader(async (jobIds: string[]) => {
        const applied = await this.jobsService.findAppliedJobIds(userId, jobIds);
        return jobIds.map((id) => applied.has(id));
      }),
    };
  }
}
