import { Resolver, Query, Mutation, Args, Context, ID } from "@nestjs/graphql";
import { UnauthorizedException } from "@nestjs/common";
import { SocialService } from "./social.service";
import { AuthService } from "../auth/auth.service";

type EntityType = "USER" | "CLUB";

@Resolver()
export class SocialResolver {
  constructor(
    private socialService: SocialService,
    private authService: AuthService,
  ) {}

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.authService.getUserFromRequest(context?.req);
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  // ─── Follows ───────────────────────────────────────────────────────────

  @Query(() => [Object])
  async followers(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.socialService.getFollowers(entityType, entityId, { limit, offset });
  }

  @Query(() => [Object])
  async following(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.socialService.getFollowing(entityType, entityId, { limit, offset });
  }

  @Mutation(() => Object)
  async follow(
    @Context() context: any,
    @Args("followerType") followerType: EntityType,
    @Args("followerId", { type: () => ID }) followerId: string,
    @Args("followingType") followingType: EntityType,
    @Args("followingId", { type: () => ID }) followingId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.resettingLoaders(context, () =>
      this.socialService.follow(
        currentUser.userId,
        followerType,
        followerId,
        followingType,
        followingId,
      ),
    );
  }

  @Mutation(() => Boolean)
  async unfollow(
    @Context() context: any,
    @Args("followerType") followerType: EntityType,
    @Args("followerId", { type: () => ID }) followerId: string,
    @Args("followingType") followingType: EntityType,
    @Args("followingId", { type: () => ID }) followingId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.resettingLoaders(context, () =>
      this.socialService.unfollow(
        currentUser.userId,
        followerType,
        followerId,
        followingType,
        followingId,
      ),
    );
  }

  // ─── Likes ─────────────────────────────────────────────────────────────

  @Query(() => [Object])
  async profileLikes(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.socialService.getProfileLikes(entityType, entityId, { limit, offset });
  }

  @Query(() => [Object])
  async likesGiven(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.socialService.getLikesGiven(entityType, entityId, { limit, offset });
  }

  @Mutation(() => Object)
  async likeProfile(
    @Context() context: any,
    @Args("likerType") likerType: EntityType,
    @Args("likerId", { type: () => ID }) likerId: string,
    @Args("likedType") likedType: EntityType,
    @Args("likedId", { type: () => ID }) likedId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.resettingLoaders(context, () =>
      this.socialService.likeProfile(
        currentUser.userId,
        likerType,
        likerId,
        likedType,
        likedId,
      ),
    );
  }

  @Mutation(() => Boolean)
  async unlikeProfile(
    @Context() context: any,
    @Args("likerType") likerType: EntityType,
    @Args("likerId", { type: () => ID }) likerId: string,
    @Args("likedType") likedType: EntityType,
    @Args("likedId", { type: () => ID }) likedId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.resettingLoaders(context, () =>
      this.socialService.unlikeProfile(
        currentUser.userId,
        likerType,
        likerId,
        likedType,
        likedId,
      ),
    );
  }

  /**
   * Mutations of one request run in sequence and may select counters of the
   * affected profile afterwards: drop the per-request cache once the write is
   * done (and on failure) so those fields read the new state.
   */
  private async resettingLoaders<T>(context: any, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } finally {
      this.socialService.resetLoaders(context);
    }
  }
}
