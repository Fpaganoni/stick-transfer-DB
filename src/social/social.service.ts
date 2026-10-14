import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { normalizeOffsetPagination } from "../common/pagination";
import { SocialLoaders } from "./social.loaders";

type EntityType = "USER" | "CLUB";

export interface OffsetPagination {
  limit?: number | null;
  offset?: number | null;
}

export interface UserBasicInfo {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
}

const USER_BASIC_SELECT = { id: true, name: true, username: true, avatar: true } as const;

/** Newest first; id breaks createdAt ties so offset pages never repeat or drop rows. */
const FOLLOW_ORDER: Prisma.FollowOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/**
 * A club is listed as the User that owns it (same id), showing the club logo
 * as avatar when it has one.
 */
function toBasicInfo(user: UserBasicInfo, clubLogo?: string | null): UserBasicInfo {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatar: clubLogo ?? user.avatar,
  };
}

@Injectable()
export class SocialService {
  private readonly loaders = new SocialLoaders(this);

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
      select: { id: true },
    });
    if (!club) throw new NotFoundException("Club not found");
    if (club.id !== currentUserId) {
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
        data: {
          followerId,
          followerType,
          followingId,
          followingType,
          followingUserId: followingType === 'USER' ? followingId : null,
          followingClubId: followingType === 'CLUB' ? followingId : null,
        },
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

  /**
   * Users and clubs following the entity, newest first. followerId always points
   * at a User (a club shares its owner's id), so one include covers both types.
   */
  async getFollowers(
    entityType: EntityType,
    entityId: string,
    pagination: OffsetPagination = {},
  ): Promise<UserBasicInfo[]> {
    const { skip, take } = normalizeOffsetPagination(pagination.limit, pagination.offset);
    const follows = await this.prisma.follow.findMany({
      where: { followingType: entityType, followingId: entityId },
      orderBy: FOLLOW_ORDER,
      skip,
      take,
      include: {
        followerUser: {
          select: { ...USER_BASIC_SELECT, clubProfile: { select: { logo: true } } },
        },
      },
    });
    return follows.flatMap(({ followerType, followerUser }) => {
      if (!followerUser) return [];
      const clubLogo = followerType === "CLUB" ? followerUser.clubProfile?.logo : null;
      return [toBasicInfo(followerUser, clubLogo)];
    });
  }

  /**
   * Users and clubs the entity follows, newest first, so the list matches
   * countFollowing. Followed clubs resolve to their owner User in the same query.
   */
  async getFollowing(
    entityType: EntityType,
    entityId: string,
    pagination: OffsetPagination = {},
  ): Promise<UserBasicInfo[]> {
    const { skip, take } = normalizeOffsetPagination(pagination.limit, pagination.offset);
    const follows = await this.prisma.follow.findMany({
      where: { followerType: entityType, followerId: entityId },
      orderBy: FOLLOW_ORDER,
      skip,
      take,
      include: {
        followedUser: { select: USER_BASIC_SELECT },
        followedClub: { select: { logo: true, user: { select: USER_BASIC_SELECT } } },
      },
    });
    return follows.flatMap(({ followedUser, followedClub }) => {
      if (followedClub) return [toBasicInfo(followedClub.user, followedClub.logo)];
      return followedUser ? [toBasicInfo(followedUser)] : [];
    });
  }

  // ─── Batched reads (one query per list, see SocialLoaders) ─────────────

  async countFollowersBatch(type: EntityType, ids: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.follow.groupBy({
      by: ["followingId"],
      where: { followingType: type, followingId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.followingId, row._count._all]));
  }

  async findFollowedIds(
    followerType: EntityType,
    followerId: string,
    followingType: EntityType,
    ids: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.follow.findMany({
      where: { followerType, followerId, followingType, followingId: { in: ids } },
      select: { followingId: true },
    });
    return new Set(rows.map((row) => row.followingId));
  }

  // Per-request wrappers for the field resolvers of User and Club.

  loadFollowersCount(context: object, type: EntityType, id: string) {
    return this.loaders.followersCount(context, type, id);
  }

  loadIsFollowing(context: object, viewerId: string, type: EntityType, id: string) {
    return this.loaders.isFollowing(context, viewerId, type, id);
  }

  /** Follow mutations call this so later fields of the same request read fresh values. */
  resetLoaders(context: object): void {
    this.loaders.reset(context);
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
}
