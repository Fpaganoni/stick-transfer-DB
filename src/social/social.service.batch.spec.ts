import { BadRequestException } from "@nestjs/common";
import { SocialService } from "./social.service";

function makeService() {
  const prisma = {
    follow: { groupBy: jest.fn(), findMany: jest.fn() },
    like: { groupBy: jest.fn(), findMany: jest.fn() },
  };
  const service = new SocialService(prisma as any, { emit: jest.fn() } as any);
  return { prisma, service };
}

describe("SocialService batched reads", () => {
  it("counts followers of many entities with one GROUP BY", async () => {
    const { prisma, service } = makeService();
    prisma.follow.groupBy.mockResolvedValue([
      { followingId: "c1", _count: { _all: 3 } },
      { followingId: "c2", _count: { _all: 1 } },
    ]);

    const counts = await service.countFollowersBatch("CLUB", ["c1", "c2", "c3"]);

    expect(prisma.follow.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.follow.groupBy).toHaveBeenCalledWith({
      by: ["followingId"],
      where: { followingType: "CLUB", followingId: { in: ["c1", "c2", "c3"] } },
      _count: { _all: true },
    });
    expect(Object.fromEntries(counts)).toEqual({ c1: 3, c2: 1 });
  });

  it("counts likes received with one GROUP BY", async () => {
    const { prisma, service } = makeService();
    prisma.like.groupBy.mockResolvedValue([{ likedId: "u1", _count: { _all: 4 } }]);

    const counts = await service.countLikesReceivedBatch("USER", ["u1", "u2"]);

    expect(prisma.like.groupBy).toHaveBeenCalledWith({
      by: ["likedId"],
      where: { likedType: "USER", likedId: { in: ["u1", "u2"] } },
      _count: { _all: true },
    });
    expect(counts.get("u1")).toBe(4);
    expect(counts.has("u2")).toBe(false);
  });

  it("finds which of many entities the viewer follows with one query", async () => {
    const { prisma, service } = makeService();
    prisma.follow.findMany.mockResolvedValue([{ followingId: "c2" }]);

    const followed = await service.findFollowedIds("USER", "me", "CLUB", ["c1", "c2"]);

    expect(prisma.follow.findMany).toHaveBeenCalledWith({
      where: {
        followerType: "USER",
        followerId: "me",
        followingType: "CLUB",
        followingId: { in: ["c1", "c2"] },
      },
      select: { followingId: true },
    });
    expect([...followed]).toEqual(["c2"]);
  });

  it("finds which of many entities the viewer liked with one query", async () => {
    const { prisma, service } = makeService();
    prisma.like.findMany.mockResolvedValue([{ likedId: "u1" }]);

    const liked = await service.findLikedIds("USER", "me", "USER", ["u1", "u2"]);

    expect(prisma.like.findMany).toHaveBeenCalledWith({
      where: {
        likerType: "USER",
        likerId: "me",
        likedType: "USER",
        likedId: { in: ["u1", "u2"] },
      },
      select: { likedId: true },
    });
    expect([...liked]).toEqual(["u1"]);
  });

  it("serves a whole list of clubs through the per-request loaders", async () => {
    const { prisma, service } = makeService();
    prisma.follow.groupBy.mockResolvedValue([{ followingId: "c1", _count: { _all: 2 } }]);
    const ctx = {};

    const counts = await Promise.all(
      ["c1", "c2", "c3"].map((id) => service.loadFollowersCount(ctx, "CLUB", id)),
    );

    expect(counts).toEqual([2, 0, 0]);
    expect(prisma.follow.groupBy).toHaveBeenCalledTimes(1);
  });

  it("resetLoaders makes the next read hit the database again", async () => {
    const { prisma, service } = makeService();
    prisma.follow.groupBy.mockResolvedValue([]);
    const ctx = {};

    await service.loadFollowersCount(ctx, "CLUB", "c1");
    service.resetLoaders(ctx);
    await service.loadFollowersCount(ctx, "CLUB", "c1");

    expect(prisma.follow.groupBy).toHaveBeenCalledTimes(2);
  });
});

describe("SocialService like lists are bounded", () => {
  it.each([
    ["getProfileLikes", { likedType: "USER", likedId: "u1" }],
    ["getLikesGiven", { likerType: "USER", likerId: "u1" }],
  ] as const)("%s paginates newest first with a stable order", async (method, where) => {
    const { prisma, service } = makeService();
    prisma.like.findMany.mockResolvedValue([]);

    await service[method]("USER", "u1", { limit: 10, offset: 20 });

    expect(prisma.like.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: 20,
      take: 10,
    });
  });

  it.each(["getProfileLikes", "getLikesGiven"] as const)(
    "%s defaults to 50 rows and rejects a limit above 100",
    async (method) => {
      const { prisma, service } = makeService();
      prisma.like.findMany.mockResolvedValue([]);

      await service[method]("CLUB", "c1");
      expect(prisma.like.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );

      prisma.like.findMany.mockClear();
      await expect(service[method]("CLUB", "c1", { limit: 101 })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.like.findMany).not.toHaveBeenCalled();
    },
  );
});
