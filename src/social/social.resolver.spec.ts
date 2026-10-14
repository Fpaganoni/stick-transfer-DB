import { SocialResolver } from "./social.resolver";

describe("SocialResolver - follow lists", () => {
  let resolver: SocialResolver;
  let socialService: any;
  const basicInfo = { id: "club", name: "Club FC", username: "clubfc", avatar: "logo.png" };

  beforeEach(() => {
    socialService = {
      getFollowers: jest.fn().mockResolvedValue([basicInfo]),
      getFollowing: jest.fn().mockResolvedValue([basicInfo]),
    };
    resolver = new SocialResolver(socialService, {} as any);
  });

  it("returns the followers as UserBasicInfo, forwarding pagination", async () => {
    await expect(resolver.followers("USER", "u1", 10, 20)).resolves.toEqual([basicInfo]);
    expect(socialService.getFollowers).toHaveBeenCalledWith("USER", "u1", {
      limit: 10,
      offset: 20,
    });
  });

  it("returns the followed profiles as UserBasicInfo, forwarding pagination", async () => {
    await expect(resolver.following("CLUB", "club", 5)).resolves.toEqual([basicInfo]);
    expect(socialService.getFollowing).toHaveBeenCalledWith("CLUB", "club", {
      limit: 5,
      offset: undefined,
    });
  });
});

describe("SocialResolver - loader reset", () => {
  let resolver: SocialResolver;
  let socialService: any;
  let authService: any;
  const ctx = { req: {} };

  beforeEach(() => {
    socialService = {
      follow: jest.fn().mockResolvedValue({ id: "f1" }),
      unfollow: jest.fn().mockResolvedValue(true),
      resetLoaders: jest.fn(),
    };
    authService = { getUserFromRequest: jest.fn().mockReturnValue({ userId: "me", role: "PLAYER" }) };
    resolver = new SocialResolver(socialService, authService);
  });

  it.each([
    ["follow", () => (r: SocialResolver) => r.follow(ctx, "USER", "me", "CLUB", "c1")],
    ["unfollow", () => (r: SocialResolver) => r.unfollow(ctx, "USER", "me", "CLUB", "c1")],
  ])("%s resets the request's cached counters so the response is not stale", async (_n, call) => {
    await call()(resolver);

    expect(socialService.resetLoaders).toHaveBeenCalledWith(ctx);
  });

  it("resets the cache even when the write fails", async () => {
    socialService.follow.mockRejectedValue(new Error("db down"));

    await expect(resolver.follow(ctx, "USER", "me", "CLUB", "c1")).rejects.toThrow("db down");

    expect(socialService.resetLoaders).toHaveBeenCalledWith(ctx);
  });
});
