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
