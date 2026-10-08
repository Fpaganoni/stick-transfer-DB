import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { UploadsResolver } from "./uploads.resolver";

describe("UploadsResolver - createImageUploadSignature", () => {
  let resolver: UploadsResolver;
  let cloudinary: any;
  let authService: any;
  const ctx = {};

  const asUser = (userId: string, role: string) =>
    authService.getUserFromRequest.mockReturnValue({ userId, role });

  beforeEach(() => {
    cloudinary = {
      signImageUpload: jest.fn().mockReturnValue({ signature: "sig" }),
    };
    authService = { getUserFromRequest: jest.fn() };
    resolver = new UploadsResolver(cloudinary, authService);
  });

  it.each(["USER_AVATAR", "USER_COVER", "CLUB_LOGO", "CLUB_COVER"] as const)(
    "%s requires a session (401)",
    (target) => {
      authService.getUserFromRequest.mockReturnValue(null);
      expect(() => resolver.createImageUploadSignature(ctx, target)).toThrow(
        UnauthorizedException,
      );
      expect(cloudinary.signImageUpload).not.toHaveBeenCalled();
    },
  );

  it.each(["USER_AVATAR", "USER_COVER"] as const)(
    "%s signs the session user's own folder, whatever the role",
    (target) => {
      asUser("u1", "PLAYER");
      expect(resolver.createImageUploadSignature(ctx, target)).toEqual({
        signature: "sig",
      });
      expect(cloudinary.signImageUpload).toHaveBeenCalledWith(target, "u1");
    },
  );

  it.each(["CLUB_LOGO", "CLUB_COVER"] as const)(
    "%s rejects non-club roles (403)",
    (target) => {
      for (const role of ["PLAYER", "COACH", "UMPIRE"]) {
        asUser("u1", role);
        expect(() => resolver.createImageUploadSignature(ctx, target)).toThrow(
          ForbiddenException,
        );
      }
      expect(cloudinary.signImageUpload).not.toHaveBeenCalled();
    },
  );

  it("CLUB_LOGO signs the club's own folder (club id = user id)", () => {
    asUser("c1", "CLUB");
    resolver.createImageUploadSignature(ctx, "CLUB_LOGO");
    expect(cloudinary.signImageUpload).toHaveBeenCalledWith("CLUB_LOGO", "c1");
  });

  it("a club cannot sign another club's folder", () => {
    asUser("c1", "CLUB");
    expect(() => resolver.createImageUploadSignature(ctx, "CLUB_COVER", "c2")).toThrow(
      ForbiddenException,
    );
    expect(cloudinary.signImageUpload).not.toHaveBeenCalled();
  });

  it("a club may pass its own clubId", () => {
    asUser("c1", "CLUB");
    resolver.createImageUploadSignature(ctx, "CLUB_COVER", "c1");
    expect(cloudinary.signImageUpload).toHaveBeenCalledWith("CLUB_COVER", "c1");
  });

  it("a super admin signs the folder of the club it names", () => {
    asUser("admin", "SUPERADMIN");
    resolver.createImageUploadSignature(ctx, "CLUB_LOGO", "c2");
    expect(cloudinary.signImageUpload).toHaveBeenCalledWith("CLUB_LOGO", "c2");
  });

  it("a super admin must say which club (400)", () => {
    asUser("admin", "SUPERADMIN");
    expect(() => resolver.createImageUploadSignature(ctx, "CLUB_LOGO")).toThrow(
      BadRequestException,
    );
    expect(cloudinary.signImageUpload).not.toHaveBeenCalled();
  });

  it.each(["x/../users/u1", "a/b", "c 1", ""])(
    "a super admin cannot smuggle a path through clubId %p",
    (clubId) => {
      asUser("admin", "SUPERADMIN");
      expect(() => resolver.createImageUploadSignature(ctx, "CLUB_LOGO", clubId)).toThrow(
        BadRequestException,
      );
      expect(cloudinary.signImageUpload).not.toHaveBeenCalled();
    },
  );

  it("ignores clubId for user targets", () => {
    asUser("u1", "PLAYER");
    resolver.createImageUploadSignature(ctx, "USER_AVATAR", "c2");
    expect(cloudinary.signImageUpload).toHaveBeenCalledWith("USER_AVATAR", "u1");
  });
});
