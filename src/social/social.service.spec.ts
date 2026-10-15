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
  me: { id: "me", name: "Me", username: "me", avatar: "me.png" },
  player: { id: "player", name: "Player", username: "player", avatar: "player.png" },
  // A club is a User with role CLUB; its Club row shares the same id.
  club: { id: "club", name: "Club FC", username: "clubfc", avatar: "club-user.png" },
  "club-no-logo": { id: "club-no-logo", name: "No Logo", username: "nologo", avatar: "nologo-user.png" },
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
    create: jest.fn(async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
      clock += 1;
      const row = { ...data, id: `follow-${clock}`, createdAt: new Date(clock * 1000) };
      rows.push(row);
      return row;
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
});
