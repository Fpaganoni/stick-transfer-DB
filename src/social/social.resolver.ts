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
    const user = this.authService.getUserFromAuthHeader(
      context?.req?.headers?.authorization,
    );
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  // ─── Follows ───────────────────────────────────────────────────────────

  @Query(() => [Object])
  async followers(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
  ) {
    return this.socialService.getFollowers(entityType, entityId);
  }

  @Query(() => [Object])
  async following(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
  ) {
    return this.socialService.getFollowing(entityType, entityId);
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
    return this.socialService.follow(
      currentUser.userId,
      followerType,
      followerId,
      followingType,
      followingId,
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
    return this.socialService.unfollow(
      currentUser.userId,
      followerType,
      followerId,
      followingType,
      followingId,
    );
  }

  // ─── Likes ─────────────────────────────────────────────────────────────

  @Query(() => [Object])
  async profileLikes(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
  ) {
    return this.socialService.getProfileLikes(entityType, entityId);
  }

  @Query(() => [Object])
  async likesGiven(
    @Args("entityType") entityType: EntityType,
    @Args("entityId", { type: () => ID }) entityId: string,
  ) {
    return this.socialService.getLikesGiven(entityType, entityId);
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
    return this.socialService.likeProfile(
      currentUser.userId,
      likerType,
      likerId,
      likedType,
      likedId,
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
    return this.socialService.unlikeProfile(
      currentUser.userId,
      likerType,
      likerId,
      likedType,
      likedId,
    );
  }
}
