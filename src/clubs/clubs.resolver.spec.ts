import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ClubsResolver } from "./clubs.resolver";

describe("ClubsResolver - authorization", () => {
  let resolver: ClubsResolver;
  let clubsService: any;
  let notifications: any;
  let cloudinary: any;
  let authService: any;
  const ctx = {};

  const asUser = (userId: string, role = "CLUB") =>
    authService.getUserFromRequest.mockReturnValue({ userId, role });
  const IMG = "data:image/png;base64,AAAA";

  beforeEach(() => {
    clubsService = {
      updateClub: jest.fn().mockResolvedValue({ id: "club-1" }),
      inviteMember: jest.fn().mockResolvedValue({ id: "m1" }),
      acceptMembership: jest.fn(),
      setLogo: jest.fn(),
      setCoverImage: jest.fn(),
      requestVerification: jest.fn(),
    };
    notifications = { sendNotification: jest.fn() };
    cloudinary = {
      uploadBase64: jest.fn().mockResolvedValue({ secure_url: "https://img" }),
    };
    authService = { getUserFromRequest: jest.fn() };
    resolver = new ClubsResolver(
      clubsService,
      notifications,
      cloudinary,
      authService,
      {} as any,
    );
  });

  describe("club-scoped mutations", () => {
    const calls: [string, () => Promise<any> | any][] = [
      ["updateClub", () => (resolver as any).updateClub(ctx, "club-1", "New name")],
      ["uploadClubLogo", () => resolver.uploadClubLogo(ctx, "club-1", IMG)],
      ["uploadClubCoverImage", () => resolver.uploadClubCoverImage(ctx, "club-1", IMG)],
      ["requestClubVerification", () => (resolver as any).requestClubVerification(ctx, "club-1", "https://doc")],
      ["invitePlayerToClub", () => (resolver as any).invitePlayerToClub(ctx, "club-1", "player-1")],
    ];

    it.each(calls)("%s requires authentication", async (_n, call) => {
      authService.getUserFromRequest.mockReturnValue(null);
      await expect(Promise.resolve().then(call)).rejects.toThrow(UnauthorizedException);
    });

    it.each(calls)("%s rejects another club's admin", async (_n, call) => {
      asUser("club-2");
      await expect(Promise.resolve().then(call)).rejects.toThrow(ForbiddenException);
      expect(clubsService.updateClub).not.toHaveBeenCalled();
      expect(clubsService.inviteMember).not.toHaveBeenCalled();
      expect(clubsService.requestVerification).not.toHaveBeenCalled();
      expect(cloudinary.uploadBase64).not.toHaveBeenCalled();
    });

    it.each(calls)("%s rejects a non-club user (player)", async (_n, call) => {
      asUser("player-1", "PLAYER");
      await expect(Promise.resolve().then(call)).rejects.toThrow(ForbiddenException);
    });

    it("allows the owning club", async () => {
      asUser("club-1");
      await (resolver as any).updateClub(ctx, "club-1", "New name");
      expect(clubsService.updateClub).toHaveBeenCalled();
      await resolver.uploadClubLogo(ctx, "club-1", IMG);
      expect(clubsService.setLogo).toHaveBeenCalledWith("club-1", "https://img");
    });

    it("passes logo, coverImage, city and country through to the service", async () => {
      asUser("club-1");
      const args: any[] = new Array(16).fill(undefined);
      await (resolver as any).updateClub(
        ctx, "club-1", ...args, "https://logo", "https://cover", "Madrid", "Spain",
      );
      expect(clubsService.updateClub).toHaveBeenCalledWith(
        "club-1",
        expect.objectContaining({
          logo: "https://logo",
          coverImage: "https://cover",
          city: "Madrid",
          country: "Spain",
        }),
      );
    });

    it.each(["uploadClubLogo", "uploadClubCoverImage"] as const)(
      "%s rejects non-image base64 before uploading",
      async (method) => {
        asUser("club-1");
        await expect(resolver[method](ctx, "club-1", "data")).rejects.toMatchObject({
          fields: [expect.objectContaining({ code: "IMAGE_FORMAT_INVALID" })],
        });
        expect(cloudinary.uploadBase64).not.toHaveBeenCalled();
      },
    );

    it("allows a super admin", async () => {
      asUser("admin", "SUPERADMIN");
      await (resolver as any).updateClub(ctx, "club-1", "Moderated");
      expect(clubsService.updateClub).toHaveBeenCalled();
    });
  });

  describe("clubAdmins", () => {
    it("is super admin only (exposes admin emails)", () => {
      clubsService.getClubAdmins = jest.fn().mockResolvedValue([]);

      authService.getUserFromRequest.mockReturnValue(null);
      expect(() => (resolver as any).clubAdmins(ctx)).toThrow(UnauthorizedException);

      asUser("club-1");
      expect(() => (resolver as any).clubAdmins(ctx)).toThrow(ForbiddenException);
      expect(clubsService.getClubAdmins).not.toHaveBeenCalled();

      asUser("admin", "SUPERADMIN");
      (resolver as any).clubAdmins(ctx);
      expect(clubsService.getClubAdmins).toHaveBeenCalled();
    });
  });

  describe("invitePlayerToClub", () => {
    it("uses the session user as inviter", async () => {
      asUser("club-1");
      await (resolver as any).invitePlayerToClub(ctx, "club-1", "player-1");
      expect(clubsService.inviteMember).toHaveBeenCalledWith(
        "club-1",
        "player-1",
        "club-1",
      );
    });

    it("rejects a spoofed invitedBy", async () => {
      asUser("club-1");
      await expect(
        (resolver as any).invitePlayerToClub(ctx, "club-1", "player-1", "someone-else"),
      ).rejects.toThrow(ForbiddenException);
      expect(clubsService.inviteMember).not.toHaveBeenCalled();
    });
  });

  describe("acceptMembership", () => {
    it("requires authentication", () => {
      authService.getUserFromRequest.mockReturnValue(null);
      expect(() => (resolver as any).acceptMembership(ctx, "m1")).toThrow(
        UnauthorizedException,
      );
    });

    it("delegates with the session user so the service can check the invitee", () => {
      asUser("player-1", "PLAYER");
      (resolver as any).acceptMembership(ctx, "m1");
      expect(clubsService.acceptMembership).toHaveBeenCalledWith("m1", "player-1");
    });
  });
});
