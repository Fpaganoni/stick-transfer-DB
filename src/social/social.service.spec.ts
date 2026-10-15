import { BadRequestException } from "@nestjs/common";
import { SocialService } from "./social.service";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../common/pagination";

type Row = {
  id: string;
  followerId: string;
  followerType: "USER" | "CLUB";
  followingId: string;
  followingType: "USER" | "CLUB";
  followingUserId: string | null;
  followingClubId: string | null;
  createdAt: Date;
};

const users: Record<string, any> = {
  me: { id: "me", role: "PLAYER", name: "Me", username: "me", avatar: "me.png" },
  player: { id: "player", role: "PLAYER", name: "Player", username: "player", avatar: "player.png" },
  // A club is a User with role CLUB; its Club row shares the same id.
  club: { id: "club", role: "CLUB", name: "Club FC", username: "clubfc", avatar: "club-user.png" },
  "club-no-logo": {
    id: "club-no-logo",
    role: "CLUB",
    name: "No Logo",
    username: "nologo",
    avatar: "nologo-user.png",
  },
};

// Club rows that exist (the crest is the owner's avatar, never read from here).
const clubs: Record<string, any> = {
  club: { id: "club" },
  "club-no-logo": { id: "club-no-logo" },
};

/**
 * Minimal in-memory stand-in for prisma.follow: honours the where filters the
 * service uses and resolves the followerUser/followedUser/followedClub relations
 * from the fixtures above, newest first.
 */
function createFollowStore() {
  const rows: Row[] = [];
  let clock = 0;

  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => (row as any)[key] === value);

  const withRelations = (row: Row) => {
    const follower = users[row.followerId];
    return {
      ...row,
      followerUser: follower ?? null,
      followedUser: row.followingUserId ? users[row.followingUserId] : null,
      followedClub: row.followingClubId
        ? { user: users[row.followingClubId] }
        : null,
    };
  };

  return {
    rows,
    // Honours the unique (followerId, followerType, followingId, followingType) index.
    create: jest.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
      const duplicate = rows.some(
        (r) =>
          r.followerId === data.followerId &&
          r.followerType === data.followerType &&
          r.followingId === data.followingId &&
          r.followingType === data.followingType,
      );
      if (duplicate) throw Object.assign(new Error("unique"), { code: "P2002" });
      clock += 1;
      const row = { ...data, id: `follow-${clock}`, createdAt: new Date(clock * 1000) };
      rows.push(row);
      return row;
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const doomed = rows.filter((r) => matches(r, where));
      for (const row of doomed) rows.splice(rows.indexOf(row), 1);
      return { count: doomed.length };
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const key = where.followerId_followerType_followingId_followingType;
      return rows.find((r) => matches(r, key)) ?? null;
    }),
    count: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
    findMany: jest.fn(async ({ where, skip = 0, take }: any) =>
      rows
        .filter((r) => matches(r, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(skip, take === undefined ? undefined : skip + take)
        .map(withRelations),
    ),
  };
}

describe("SocialService - follows", () => {
  let service: SocialService;
  let follow: ReturnType<typeof createFollowStore>;
  let prisma: any;
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    follow = createFollowStore();
    prisma = {
      follow,
      club: {
        findUnique: jest.fn(async ({ where }: any) => (clubs[where.id] ? { id: where.id } : null)),
      },
      // Role lookup used to normalize club accounts to the CLUB axis.
      user: {
        findMany: jest.fn(async ({ where }: any) =>
          (where.id.in as string[])
            .filter((id) => users[id]?.role === where.role)
            .map((id) => ({ id })),
        ),
      },
    };
    eventEmitter = { emit: jest.fn() };
    service = new SocialService(prisma, eventEmitter as any);
  });

  describe("getFollowing", () => {
    it("lists a followed user and a followed club (avatar = owner avatar), matching followingCount", async () => {
      await service.follow("me", "USER", "me", "USER", "player");
      await service.follow("me", "USER", "me", "CLUB", "club");

      const count = await service.countFollowing("USER", "me");
      const following = await service.getFollowing("USER", "me");

      expect(count).toBe(2);
      expect(following).toHaveLength(2);
      // Newest first: the club was followed last.
      expect(following).toEqual([
        { id: "club", name: "Club FC", username: "clubfc", avatar: "club-user.png" },
        { id: "player", name: "Player", username: "player", avatar: "player.png" },
      ]);
    });

    it("reads a followed club's crest from its owner user", async () => {
      await service.follow("me", "USER", "me", "CLUB", "club-no-logo");

      const [entry] = await service.getFollowing("USER", "me");

      expect(entry).toEqual({
        id: "club-no-logo",
        name: "No Logo",
        username: "nologo",
        avatar: "nologo-user.png",
      });
    });

    it("loads users and clubs in a single findMany with a stable newest-first order", async () => {
      await service.getFollowing("USER", "me");

      expect(follow.findMany).toHaveBeenCalledTimes(1);
      expect(follow.findMany).toHaveBeenCalledWith({
        where: { followerType: "USER", followerId: "me" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: DEFAULT_PAGE_SIZE,
        include: {
          followedUser: { select: { id: true, name: true, username: true, avatar: true } },
          followedClub: {
            select: {
              user: { select: { id: true, name: true, username: true, avatar: true } },
            },
          },
        },
      });
    });

    it("applies limit and offset", async () => {
      await service.follow("me", "USER", "me", "USER", "player");
      await service.follow("me", "USER", "me", "CLUB", "club");

      const page = await service.getFollowing("USER", "me", { limit: 1, offset: 1 });

      expect(page.map((u) => u.id)).toEqual(["player"]);
      expect(follow.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1 }));
    });

    it.each([
      { limit: MAX_PAGE_SIZE + 1 },
      { limit: 0 },
      { offset: -1 },
      { limit: 1.5 },
    ])("rejects invalid pagination %p with a 400", async (pagination) => {
      await expect(service.getFollowing("USER", "me", pagination)).rejects.toThrow(
        BadRequestException,
      );
      expect(follow.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getFollowers", () => {
    it("lists user and club followers, using the owner avatar for clubs", async () => {
      await service.follow("me", "USER", "me", "USER", "player");
      await service.follow("club", "CLUB", "club", "USER", "player");

      const count = await service.countFollowers("USER", "player");
      const followers = await service.getFollowers("USER", "player");

      expect(count).toBe(2);
      expect(followers).toEqual([
        { id: "club", name: "Club FC", username: "clubfc", avatar: "club-user.png" },
        { id: "me", name: "Me", username: "me", avatar: "me.png" },
      ]);
    });

    it("reads a club follower's crest from its user avatar", async () => {
      await service.follow("club-no-logo", "CLUB", "club-no-logo", "USER", "player");

      const [entry] = await service.getFollowers("USER", "player");

      expect(entry.avatar).toBe("nologo-user.png");
    });

    it("paginates with a stable newest-first order in a single findMany", async () => {
      await service.getFollowers("USER", "player", { limit: 10, offset: 20 });

      expect(follow.findMany).toHaveBeenCalledTimes(1);
      expect(follow.findMany).toHaveBeenCalledWith({
        where: { followingType: "USER", followingId: "player" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 20,
        take: 10,
        include: {
          followerUser: {
            select: { id: true, name: true, username: true, avatar: true },
          },
        },
      });
    });

    it("rejects a limit above the maximum", async () => {
      await expect(
        service.getFollowers("USER", "player", { limit: MAX_PAGE_SIZE + 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // A CLUB account is followed ONLY on the CLUB axis; a USER target with the id
  // of a CLUB account is normalized to CLUB instead of failing (old clients).
  describe("single social axis for club accounts", () => {
    it("stores a follow aimed at a club through the USER axis on the CLUB axis", async () => {
      const row = await service.follow("me", "USER", "me", "USER", "club");

      expect(row).toMatchObject({
        followingType: "CLUB",
        followingId: "club",
        followingClubId: "club",
        followingUserId: null,
      });
      expect(follow.rows).toHaveLength(1);
    });

    it("never writes a second row when the same club is followed on both axes", async () => {
      await service.follow("me", "USER", "me", "USER", "club");

      await expect(service.follow("me", "USER", "me", "CLUB", "club")).rejects.toThrow(
        "Already following",
      );
      await expect(service.follow("me", "USER", "me", "USER", "club")).rejects.toThrow(
        "Already following",
      );
      expect(follow.rows).toHaveLength(1);
    });

    it("keeps a plain USER target on the USER axis", async () => {
      const row = await service.follow("me", "USER", "me", "USER", "player");

      expect(row).toMatchObject({
        followingType: "USER",
        followingUserId: "player",
        followingClubId: null,
      });
    });

    it("unfollows through either axis", async () => {
      await service.follow("me", "USER", "me", "CLUB", "club");

      await expect(service.unfollow("me", "USER", "me", "USER", "club")).resolves.toBe(true);
      expect(follow.rows).toHaveLength(0);
    });

    it("answers isFollowing through either axis", async () => {
      await service.follow("me", "USER", "me", "USER", "club");

      await expect(service.isFollowing("USER", "me", "USER", "club")).resolves.toBe(true);
      await expect(service.isFollowing("USER", "me", "CLUB", "club")).resolves.toBe(true);
    });

    it("gives the same follower count through either axis", async () => {
      await service.follow("me", "USER", "me", "USER", "club");
      await service.follow("player", "USER", "player", "CLUB", "club");

      const viaUser = await service.countFollowers("USER", "club");
      const viaClub = await service.countFollowers("CLUB", "club");

      expect(viaUser).toBe(2);
      expect(viaClub).toBe(viaUser);
    });

    it("lists the same followers through either axis", async () => {
      await service.follow("me", "USER", "me", "USER", "club");

      const viaUser = await service.getFollowers("USER", "club");
      const viaClub = await service.getFollowers("CLUB", "club");

      expect(viaUser).toEqual([{ id: "me", name: "Me", username: "me", avatar: "me.png" }]);
      expect(viaClub).toEqual(viaUser);
    });

    it("normalizes the acting club account to the CLUB follower axis", async () => {
      const row = await service.follow("club", "USER", "club", "USER", "player");

      expect(row).toMatchObject({ followerType: "CLUB", followerId: "club" });
      await expect(service.countFollowing("USER", "club")).resolves.toBe(1);
      await expect(service.countFollowing("CLUB", "club")).resolves.toBe(1);
    });

    it("still forbids acting as another user", async () => {
      await expect(service.follow("me", "USER", "player", "USER", "club")).rejects.toThrow(
        "You can only act on behalf of yourself",
      );
    });

    it("forbids acting as a club the caller does not own, through either axis", async () => {
      // "club" is a CLUB account: USER with its id normalizes to CLUB and ownership is checked.
      await expect(service.follow("me", "USER", "club", "USER", "player")).rejects.toThrow(
        "You are not the admin of this club",
      );
      await expect(service.follow("me", "CLUB", "club", "USER", "player")).rejects.toThrow(
        "You are not the admin of this club",
      );
      expect(follow.rows).toHaveLength(0);
    });

    it("does not let a non-owner unfollow on behalf of a club", async () => {
      await service.follow("club", "CLUB", "club", "USER", "player");

      await expect(service.unfollow("me", "USER", "club", "USER", "player")).rejects.toThrow(
        "You are not the admin of this club",
      );
      expect(follow.rows).toHaveLength(1);
    });

    it("lists the same followed accounts for a club actor through either axis", async () => {
      await service.follow("club", "USER", "club", "USER", "player");

      const viaUser = await service.getFollowing("USER", "club");
      const viaClub = await service.getFollowing("CLUB", "club");

      expect(viaUser).toEqual([{ id: "player", name: "Player", username: "player", avatar: "player.png" }]);
      expect(viaClub).toEqual(viaUser);
    });

    it("still rejects following yourself after normalizing", async () => {
      await expect(service.follow("club", "USER", "club", "CLUB", "club")).rejects.toThrow(
        "You cannot follow yourself",
      );
    });

    it("notifies the club about a new follower (recipient = the club id)", async () => {
      await service.follow("me", "USER", "me", "USER", "club");

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "social.follow_created",
        expect.objectContaining({ actorId: "me", recipientId: "club", type: "NEW_FOLLOWER" }),
      );
    });

    it("resolves the roles of a follow with ONE user lookup", async () => {
      await service.follow("me", "USER", "me", "USER", "club");

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
