import { createBatchLoader, JobsLoaders } from "./jobs.loaders";

describe("createBatchLoader", () => {
  it("batches keys requested in the same tick into one call, in key order", async () => {
    const batchFn = jest.fn(async (keys: string[]) => keys.map((k) => k.toUpperCase()));
    const loader = createBatchLoader(batchFn);

    const result = await Promise.all([loader.load("a"), loader.load("b"), loader.load("c")]);

    expect(result).toEqual(["A", "B", "C"]);
    expect(batchFn).toHaveBeenCalledTimes(1);
    expect(batchFn).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("batches keys that arrive after extra microtask hops", async () => {
    const batchFn = jest.fn(async (keys: string[]) => keys);
    const loader = createBatchLoader(batchFn);
    const delayed = async (key: string, hops: number) => {
      for (let i = 0; i < hops; i++) await Promise.resolve();
      return loader.load(key);
    };

    await Promise.all([delayed("a", 0), delayed("b", 3), delayed("c", 6)]);

    expect(batchFn).toHaveBeenCalledTimes(1);
  });

  it("serves a repeated key from cache, also in a later tick", async () => {
    const batchFn = jest.fn(async (keys: string[]) => keys);
    const loader = createBatchLoader(batchFn);

    await loader.load("a");
    await loader.load("a");

    expect(batchFn).toHaveBeenCalledTimes(1);
  });

  it("starts a new batch for keys requested in a later tick", async () => {
    const batchFn = jest.fn(async (keys: string[]) => keys);
    const loader = createBatchLoader(batchFn);

    await loader.load("a");
    await loader.load("b");

    expect(batchFn).toHaveBeenCalledTimes(2);
    expect(batchFn).toHaveBeenLastCalledWith(["b"]);
  });

  it("splits a big batch into chunks of at most maxBatchSize keys, keeping order", async () => {
    const batchFn = jest.fn(async (keys: number[]) => keys.map((k) => k * 2));
    const loader = createBatchLoader(batchFn, { maxBatchSize: 3 });

    const result = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((k) => loader.load(k)));

    expect(result).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(batchFn.mock.calls.map(([keys]) => keys)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it.each([0, -5, Number.NaN])(
    "never loops forever on an invalid maxBatchSize (%p): falls back to chunks of one",
    async (maxBatchSize) => {
      const batchFn = jest.fn(async (keys: number[]) => keys);
      const loader = createBatchLoader(batchFn, { maxBatchSize });

      const result = await Promise.all([1, 2, 3].map((k) => loader.load(k)));

      expect(result).toEqual([1, 2, 3]);
      expect(batchFn).toHaveBeenCalledTimes(3);
    },
  );

  it("rejects every key when any chunk fails", async () => {
    const batchFn = jest.fn(async (keys: number[]) => {
      if (keys.includes(4)) throw new Error("chunk down");
      return keys;
    });
    const loader = createBatchLoader(batchFn, { maxBatchSize: 3 });

    const results = await Promise.allSettled([1, 2, 3, 4, 5].map((k) => loader.load(k)));

    expect(results.every((r) => r.status === "rejected")).toBe(true);
  });

  it("rejects every load in the batch when the batch function fails", async () => {
    const loader = createBatchLoader<string, string>(async () => {
      throw new Error("db down");
    });

    const results = await Promise.allSettled([loader.load("a"), loader.load("b")]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });

  it("rejects when the batch function returns the wrong number of values", async () => {
    const loader = createBatchLoader<string, string>(async () => ["only-one"]);

    await expect(Promise.all([loader.load("a"), loader.load("b")])).rejects.toThrow(
      "one value per key",
    );
  });
});

describe("JobsLoaders.forContext", () => {
  const buildLoaders = () => {
    const jobsService = {
      findSavedJobIds: jest.fn(async (_userId: string, ids: string[]) => new Set(ids)),
      findAppliedJobIds: jest.fn(async () => new Set<string>()),
    };
    return { jobsService, loaders: new JobsLoaders(jobsService as any) };
  };

  it("reuses the same loaders for the same context and user", () => {
    const { loaders } = buildLoaders();
    const context = {};

    expect(loaders.forContext(context, "u1")).toBe(loaders.forContext(context, "u1"));
  });

  it("never shares loaders across users in one context or across contexts", () => {
    const { loaders } = buildLoaders();
    const context = {};

    expect(loaders.forContext(context, "u1")).not.toBe(loaders.forContext(context, "u2"));
    expect(loaders.forContext({}, "u1")).not.toBe(loaders.forContext({}, "u1"));
  });

  it("scopes each batch query to its own user", async () => {
    const { loaders, jobsService } = buildLoaders();
    const context = {};

    await loaders.forContext(context, "u1").isSaved.load("job-1");
    await loaders.forContext(context, "u2").isSaved.load("job-1");

    expect(jobsService.findSavedJobIds).toHaveBeenNthCalledWith(1, "u1", ["job-1"]);
    expect(jobsService.findSavedJobIds).toHaveBeenNthCalledWith(2, "u2", ["job-1"]);
  });
});
