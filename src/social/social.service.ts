import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../prisma.service";

type EntityType = "USER" | "CLUB";

@Injectable()
export class SocialService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Ensures the authenticated user is allowed to act as the given entity:
   * a USER can only act as themselves; a CLUB action requires the
   * authenticated user to be that club's admin.
   */
  private async assertCanActAs(
    entityType: EntityType,
    entityId: string,
    currentUserId: string,
  ) {
    if (entityType === "USER") {
      if (entityId !== currentUserId) {
        throw new ForbiddenException("You can only act on behalf of yourself");
      }
      return;
    }

    const club = await this.prisma.club.findUnique({
      where: { id: entityId },
      select: { adminId: true },
    });
    if (!club) throw new NotFoundException("Club not found");
    if (club.adminId !== currentUserId) {
      throw new ForbiddenException("You are not the admin of this club");
    }
  }

  // ─── Follows ───────────────────────────────────────────────────────────

  async follow(
    currentUserId: string,
    followerType: EntityType,
    followerId: string,
    followingType: EntityType,
    followingId: string,
  ) {
    await this.assertCanActAs(followerType, followerId, currentUserId);

    if (followerType === followingType && followerId === followingId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    try {
      const follow = await this.prisma.follow.create({
        data: { followerId, followerType, followingId, followingType },
      });

      if (followingType === "USER") {
        this.eventEmitter.emit("social.follow_created", {
          actorId: currentUserId,
          recipientId: followingId,
          type: NotificationType.NEW_FOLLOWER,
          entityId: follow.id,
        });
      }

      return follow;
    } catch (error) {
      if (error.code === "P2002") {
        throw new BadRequestException("Already following");
      }
      throw error;
    }
  }

  async unfollow(
    currentUserId: string,
    followerType: EntityType,
    followerId: string,
    followingType: EntityType,
    followingId: string,
  ) {
    await this.assertCanActAs(followerType, followerId, currentUserId);

    const { count } = await this.prisma.follow.deleteMany({
      where: { followerId, followerType, followingId, followingType },
    });

    return count > 0;
  }

  async getFollowers(entityType: EntityType, entityId: string) {
    return this.prisma.follow.findMany({
      where: { followingType: entityType, followingId: entityId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getFollowing(entityType: EntityType, entityId: string) {
    return this.prisma.follow.findMany({
      where: { followerType: entityType, followerId: entityId },
      orderBy: { createdAt: "desc" },
    });
  }

  // ─── Likes ─────────────────────────────────────────────────────────────

  async likeProfile(
    currentUserId: string,
    likerType: EntityType,
    likerId: string,
    likedType: EntityType,
    likedId: string,
  ) {
    await this.assertCanActAs(likerType, likerId, currentUserId);

    if (likerType === likedType && likerId === likedId) {
      throw new BadRequestException("You cannot like yourself");
    }

    try {
      const like = await this.prisma.like.create({
        data: { likerId, likerType, likedId, likedType },
      });

      if (likedType === "USER") {
        this.eventEmitter.emit("social.like_created", {
          actorId: currentUserId,
          recipientId: likedId,
          type: NotificationType.NEW_LIKE,
          entityId: like.id,
        });
      }

      return like;
    } catch (error) {
      if (error.code === "P2002") {
        throw new BadRequestException("Already liked");
      }
      throw error;
    }
  }

  async unlikeProfile(
    currentUserId: string,
    likerType: EntityType,
    likerId: string,
    likedType: EntityType,
    likedId: string,
  ) {
    await this.assertCanActAs(likerType, likerId, currentUserId);

    const { count } = await this.prisma.like.deleteMany({
      where: { likerId, likerType, likedId, likedType },
    });

    return count > 0;
  }

  async getProfileLikes(entityType: EntityType, entityId: string) {
    return this.prisma.like.findMany({
      where: { likedType: entityType, likedId: entityId },
      orderBy: { createdAt: "desc" },
    });
  }

  async getLikesGiven(entityType: EntityType, entityId: string) {
    return this.prisma.like.findMany({
      where: { likerType: entityType, likerId: entityId },
      orderBy: { createdAt: "desc" },
    });
  }

  // ─── Counts & current-user checks (for field resolvers) ────────────────

  async countFollowers(entityType: EntityType, entityId: string) {
    return this.prisma.follow.count({
      where: { followingType: entityType, followingId: entityId },
    });
  }

  async countFollowing(entityType: EntityType, entityId: string) {
    return this.prisma.follow.count({
      where: { followerType: entityType, followerId: entityId },
    });
  }

  async countLikesReceived(entityType: EntityType, entityId: string) {
    return this.prisma.like.count({
      where: { likedType: entityType, likedId: entityId },
    });
  }

  async isFollowing(
    followerType: EntityType,
    followerId: string,
    followingType: EntityType,
    followingId: string,
  ) {
    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followerType_followingId_followingType: {
          followerId,
          followerType,
          followingId,
          followingType,
        },
      },
    });
    return !!follow;
  }

  async hasLiked(
    likerType: EntityType,
    likerId: string,
    likedType: EntityType,
    likedId: string,
  ) {
    const like = await this.prisma.like.findUnique({
      where: {
        likerId_likerType_likedId_likedType: {
          likerId,
          likerType,
          likedId,
          likedType,
        },
      },
    });
    return !!like;
  }
}
