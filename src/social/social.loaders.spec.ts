import { SocialBatchSource, SocialLoaders } from "./social.loaders";

function makeSource(overrides: Partial<SocialBatchSource> = {}) {
  const source = {
    countFollowersBatch: jest.fn(async (_type, ids: string[]) =>
      new Map(ids.filter((id) => id !== "none").map((id) => [id, id.length])),
    ),
    findFollowedIds: jest.fn(async (_ft, _fid, _t, ids: string[]) =>
      new Set(ids.filter((id) => id.startsWith("f"))),
    ),
    ...overrides,
  };
  return source;
}

describe("SocialLoaders", () => {
  it("answers every club of a list with ONE followers query", async () => {
    const source = makeSource();
    const loaders = new SocialLoaders(source);
    const ctx = {};

    const counts = await Promise.all(
      ["aa", "bbb", "c"].map((id) => loaders.followersCount(ctx, "CLUB", id)),
    );

    expect(counts).toEqual([2, 3, 1]);
    expect(source.countFollowersBatch).toHaveBeenCalledTimes(1);
    expect(source.countFollowersBatch).toHaveBeenCalledWith("CLUB", ["aa", "bbb", "c"]);
  });

  it("reports 0 for an entity with no followers", async () => {
    const loaders = new SocialLoaders(makeSource());

    await expect(loaders.followersCount({}, "USER", "none")).resolves.toBe(0);
  });

  it("keeps USER and CLUB lookups in separate batches", async () => {
    const source = makeSource();
    const loaders = new SocialLoaders(source);
    const ctx = {};

    await Promise.all([loaders.followersCount(ctx, "USER", "u1"), loaders.followersCount(ctx, "CLUB", "c1")]);

    expect(source.countFollowersBatch).toHaveBeenCalledTimes(2);
  });

  it("resolves 'is followed by me' for a whole list in one query, per viewer", async () => {
    const source = makeSource();
    const loaders = new SocialLoaders(source);
    const ctx = {};

    const flags = await Promise.all(
      ["f1", "x2", "f3"].map((id) => loaders.isFollowing(ctx, "viewer-1", "CLUB", id)),
    );

    expect(flags).toEqual([true, false, true]);
    expect(source.findFollowedIds).toHaveBeenCalledTimes(1);
    expect(source.findFollowedIds).toHaveBeenCalledWith("USER", "viewer-1", "CLUB", ["f1", "x2", "f3"]);
  });

  it("never mixes the answers of two viewers", async () => {
    const source = makeSource();
    const loaders = new SocialLoaders(source);
    const ctx = {};

    await Promise.all([
      loaders.isFollowing(ctx, "viewer-1", "CLUB", "f1"),
      loaders.isFollowing(ctx, "viewer-2", "CLUB", "f1"),
    ]);

    expect(source.findFollowedIds).toHaveBeenCalledTimes(2);
  });

  it("caches within a request and not across requests", async () => {
    const source = makeSource();
    const loaders = new SocialLoaders(source);
    const requestA = {};
    const requestB = {};

    await loaders.followersCount(requestA, "CLUB", "a");
    await loaders.followersCount(requestA, "CLUB", "a");
    await loaders.followersCount(requestB, "CLUB", "a");

    expect(source.countFollowersBatch).toHaveBeenCalledTimes(2);
  });

  it("reset drops the cached answers so later fields see a mutation's effect", async () => {
    const source = makeSource();
    const loaders = new SocialLoaders(source);
    const ctx = {};

    await loaders.followersCount(ctx, "CLUB", "a");
    loaders.reset(ctx);
    await loaders.followersCount(ctx, "CLUB", "a");

    expect(source.countFollowersBatch).toHaveBeenCalledTimes(2);
  });

  it("works without a request context object", async () => {
    const loaders = new SocialLoaders(makeSource());

    await expect(loaders.followersCount(undefined as any, "USER", "ab")).resolves.toBe(2);
  });

  it("propagates a database failure to every waiting field", async () => {
    const source = makeSource({
      countFollowersBatch: jest.fn().mockRejectedValue(new Error("db down")),
    });
    const loaders = new SocialLoaders(source);
    const ctx = {};

    const results = await Promise.allSettled([
      loaders.followersCount(ctx, "CLUB", "a"),
      loaders.followersCount(ctx, "CLUB", "b"),
    ]);

    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });
});
