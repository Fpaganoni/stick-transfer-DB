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

describe("SocialResolver - like lists and loader reset", () => {
  let resolver: SocialResolver;
  let socialService: any;
  let authService: any;
  const ctx = { req: {} };

  beforeEach(() => {
    socialService = {
      getProfileLikes: jest.fn().mockResolvedValue([]),
      getLikesGiven: jest.fn().mockResolvedValue([]),
      follow: jest.fn().mockResolvedValue({ id: "f1" }),
      unfollow: jest.fn().mockResolvedValue(true),
      likeProfile: jest.fn().mockResolvedValue({ id: "l1" }),
      unlikeProfile: jest.fn().mockResolvedValue(true),
      resetLoaders: jest.fn(),
    };
    authService = { getUserFromRequest: jest.fn().mockReturnValue({ userId: "me", role: "PLAYER" }) };
    resolver = new SocialResolver(socialService, authService);
  });

  it("forwards limit and offset to profileLikes and likesGiven", async () => {
    await resolver.profileLikes("CLUB", "c1", 10, 20);
    await resolver.likesGiven("USER", "u1", 5);

    expect(socialService.getProfileLikes).toHaveBeenCalledWith("CLUB", "c1", { limit: 10, offset: 20 });
    expect(socialService.getLikesGiven).toHaveBeenCalledWith("USER", "u1", {
      limit: 5,
      offset: undefined,
    });
  });

  it.each([
    ["follow", () => (r: SocialResolver) => r.follow(ctx, "USER", "me", "CLUB", "c1")],
    ["unfollow", () => (r: SocialResolver) => r.unfollow(ctx, "USER", "me", "CLUB", "c1")],
    ["likeProfile", () => (r: SocialResolver) => r.likeProfile(ctx, "USER", "me", "CLUB", "c1")],
    ["unlikeProfile", () => (r: SocialResolver) => r.unlikeProfile(ctx, "USER", "me", "CLUB", "c1")],
  ])("%s resets the request's cached counters so the response is not stale", async (_n, call) => {
    await call()(resolver);

    expect(socialService.resetLoaders).toHaveBeenCalledWith(ctx);
  });
});
