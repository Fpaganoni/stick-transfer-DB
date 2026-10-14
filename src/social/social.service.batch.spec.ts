import { SocialService } from "./social.service";

function makeService() {
  const prisma = {
    follow: { groupBy: jest.fn(), findMany: jest.fn() },
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
