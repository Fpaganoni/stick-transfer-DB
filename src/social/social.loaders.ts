import { BatchLoader, createBatchLoader } from "../common/batch-loader";

type EntityType = "USER" | "CLUB";

/** The batched queries SocialLoaders needs; SocialService implements them. */
export interface SocialBatchSource {
  countFollowersBatch(type: EntityType, ids: string[]): Promise<Map<string, number>>;
  countLikesReceivedBatch(type: EntityType, ids: string[]): Promise<Map<string, number>>;
  findFollowedIds(
    followerType: EntityType,
    followerId: string,
    followingType: EntityType,
    ids: string[],
  ): Promise<Set<string>>;
  findLikedIds(
    likerType: EntityType,
    likerId: string,
    likedType: EntityType,
    ids: string[],
  ): Promise<Set<string>>;
}

/**
 * Per-request loaders for the social fields of User and Club (counters and the
 * "by current user" flags). A list that selects them costs one query per field
 * instead of one per row. Loaders live in a WeakMap keyed by the GraphQL
 * context object (one per request), so nothing is cached across requests or
 * viewers.
 */
export class SocialLoaders {
  private readonly byContext = new WeakMap<object, Map<string, BatchLoader<string, any>>>();

  constructor(private readonly source: SocialBatchSource) {}

  followersCount(context: object, type: EntityType, id: string): Promise<number> {
    return this.loader<number>(context, `followers:${type}`, async (ids) => {
      const counts = await this.source.countFollowersBatch(type, ids);
      return ids.map((key) => counts.get(key) ?? 0);
    }).load(id);
  }

  likesReceivedCount(context: object, type: EntityType, id: string): Promise<number> {
    return this.loader<number>(context, `likes:${type}`, async (ids) => {
      const counts = await this.source.countLikesReceivedBatch(type, ids);
      return ids.map((key) => counts.get(key) ?? 0);
    }).load(id);
  }

  /** Does the signed-in USER follow `type` entity `id`? Batched per viewer. */
  isFollowing(context: object, viewerId: string, type: EntityType, id: string): Promise<boolean> {
    return this.loader<boolean>(context, `following:${viewerId}:${type}`, async (ids) => {
      const followed = await this.source.findFollowedIds("USER", viewerId, type, ids);
      return ids.map((key) => followed.has(key));
    }).load(id);
  }

  /** Did the signed-in USER like `type` entity `id`? Batched per viewer. */
  hasLiked(context: object, viewerId: string, type: EntityType, id: string): Promise<boolean> {
    return this.loader<boolean>(context, `liked:${viewerId}:${type}`, async (ids) => {
      const liked = await this.source.findLikedIds("USER", viewerId, type, ids);
      return ids.map((key) => liked.has(key));
    }).load(id);
  }

  /**
   * Drops the request's cached answers. Follow/like mutations call this so
   * later fields of the same operation (mutations run in sequence) do not read
   * pre-mutation values.
   */
  reset(context: object): void {
    if (typeof context === "object" && context !== null) {
      this.byContext.delete(context);
    }
  }

  private loader<V>(
    context: object,
    key: string,
    batchFn: (ids: string[]) => Promise<V[]>,
  ): BatchLoader<string, V> {
    if (typeof context !== "object" || context === null) {
      return createBatchLoader(batchFn); // no request scope: batch only, cache nothing
    }
    const registry = this.byContext.get(context) ?? new Map<string, BatchLoader<string, any>>();
    this.byContext.set(context, registry);

    const existing = registry.get(key);
    if (existing) return existing;

    const created = createBatchLoader(batchFn);
    registry.set(key, created);
    return created;
  }
}
