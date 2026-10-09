import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { UsersResolver } from "./users.resolver";

describe("UsersResolver - authorization", () => {
  let resolver: UsersResolver;
  let usersService: any;
  let authService: any;
  let cloudinary: any;

  const ctx = {};
  const IMG = "data:image/png;base64,AAAA";

  beforeEach(() => {
    usersService = {
      updateUser: jest.fn().mockResolvedValue({ id: "u1" }),
      findById: jest.fn().mockResolvedValue({ id: "u1", role: "PLAYER" }),
      setAvatar: jest.fn(),
      setCoverImage: jest.fn(),
      setCv: jest.fn(),
      deleteCv: jest.fn(),
      assertActiveClubMember: jest.fn().mockResolvedValue(undefined),
    };
    authService = { getUserFromRequest: jest.fn() };
    cloudinary = {
      uploadBase64: jest.fn().mockResolvedValue({ secure_url: "https://img" }),
      uploadPdf: jest.fn().mockResolvedValue({ secure_url: "https://cv" }),
    };
    resolver = new UsersResolver(
      usersService,
      authService,
      cloudinary,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const asUser = (userId: string, role = "PLAYER") =>
    authService.getUserFromRequest.mockReturnValue({ userId, role });

  describe("updateUser", () => {
    it("rejects unauthenticated callers", async () => {
      authService.getUserFromRequest.mockReturnValue(null);
      await expect(resolver.updateUser(ctx, "u1")).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.updateUser).not.toHaveBeenCalled();
    });

    it("rejects editing another user's profile", async () => {
      asUser("attacker");
      await expect(resolver.updateUser(ctx, "u1", "Hacked")).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.updateUser).not.toHaveBeenCalled();
    });

    it("allows a user to edit their own profile", async () => {
      asUser("u1");
      await resolver.updateUser(ctx, "u1", "New name");
      expect(usersService.updateUser).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ name: "New name" }),
      );
    });

    it("allows a super admin to edit any profile", async () => {
      asUser("admin", "SUPERADMIN");
      await resolver.updateUser(ctx, "u1", "Moderated");
      expect(usersService.updateUser).toHaveBeenCalled();
    });

    it("requires an active membership to set clubId", async () => {
      asUser("u1");
      usersService.assertActiveClubMember.mockRejectedValue(
        new ForbiddenException(),
      );
      await expect(
        resolver.updateUser(
          ctx, "u1", undefined, undefined, undefined, undefined, undefined,
          undefined, undefined, undefined, undefined, "club-1",
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(usersService.assertActiveClubMember).toHaveBeenCalledWith(
        "u1",
        "club-1",
      );
      expect(usersService.updateUser).not.toHaveBeenCalled();
    });

    it("lets a super admin set clubId without membership", async () => {
      asUser("admin", "SUPERADMIN");
      await resolver.updateUser(
        ctx, "u1", undefined, undefined, undefined, undefined, undefined,
        undefined, undefined, undefined, undefined, "club-1",
      );
      expect(usersService.assertActiveClubMember).not.toHaveBeenCalled();
      expect(usersService.updateUser).toHaveBeenCalled();
    });

    describe("position and dateOfBirth", () => {
      // updateUser takes positional args: position is #8 after ctx/id, dateOfBirth #15.
      const POSITION_ARG = 8;
      const DATE_OF_BIRTH_ARG = 15;
      const update = (opts: { position?: string | null; dateOfBirth?: string }) => {
        const args: unknown[] = [ctx, "u1"];
        args[POSITION_ARG] = opts.position;
        args[DATE_OF_BIRTH_ARG] = opts.dateOfBirth;
        return (resolver as any).updateUser(...args);
      };
      const fieldsOf = async (p: Promise<unknown>) => {
        try {
          await p;
        } catch (e: any) {
          return e.fields as { field: string; code: string }[];
        }
        throw new Error("expected rejection");
      };

      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date("2026-10-09T12:00:00Z"));
        asUser("u1");
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it.each(["1800-01-01", "2030-01-01", "2001-02-30", "01/02/2000"])(
        "rejects dateOfBirth %p",
        async (dateOfBirth) => {
          const fields = await fieldsOf(update({ dateOfBirth }));
          expect(fields.map((f) => f.field)).toEqual(["dateOfBirth"]);
          expect(usersService.updateUser).not.toHaveBeenCalled();
        },
      );

      it("passes a valid dateOfBirth through", async () => {
        await update({ dateOfBirth: "2010-10-09" });
        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ dateOfBirth: "2010-10-09" }),
        );
      });

      it("keeps a valid position for a stored PLAYER", async () => {
        await update({ position: "attacker" });
        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ position: "attacker" }),
        );
      });

      it("rejects an invalid position for a stored PLAYER", async () => {
        const fields = await fieldsOf(update({ position: "Forward" }));
        expect(fields).toEqual([expect.objectContaining({ field: "position", code: "POSITION_INVALID" })]);
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("stores null position when the stored role is not PLAYER", async () => {
        usersService.findById.mockResolvedValue({ id: "u1", role: "COACH" });
        await update({ position: "goalkeeper" });
        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ position: null }),
        );
      });

      it("uses the stored role, not the caller's, when an admin edits", async () => {
        asUser("admin", "SUPERADMIN");
        usersService.findById.mockResolvedValue({ id: "u1", role: "PLAYER" });
        const fields = await fieldsOf(update({ position: "striker" }));
        expect(fields[0]).toMatchObject({ code: "POSITION_INVALID" });
      });

      it("does not look the user up when position is not sent", async () => {
        await update({});
        expect(usersService.findById).not.toHaveBeenCalled();
      });
    });
  });

  describe("private fields (email, licenseNumber)", () => {
    const profile = { id: "u1", email: "u1@test.com", licenseNumber: "LIC-1" };

    it("hides them from anonymous viewers", async () => {
      authService.getUserFromRequest.mockReturnValue(null);
      await expect(resolver.email(profile, ctx)).resolves.toBeNull();
      await expect(resolver.licenseNumber(profile, ctx)).resolves.toBeNull();
    });

    it("hides them from other users", async () => {
      asUser("other");
      await expect(resolver.email(profile, ctx)).resolves.toBeNull();
      await expect(resolver.licenseNumber(profile, ctx)).resolves.toBeNull();
    });

    it("shows them to the owner", async () => {
      asUser("u1");
      await expect(resolver.email(profile, ctx)).resolves.toBe("u1@test.com");
      await expect(resolver.licenseNumber(profile, ctx)).resolves.toBe("LIC-1");
    });

    it("shows them to a super admin", async () => {
      asUser("admin", "SUPERADMIN");
      await expect(resolver.email(profile, ctx)).resolves.toBe("u1@test.com");
    });

    it("login returns a profile whose email is visible to the new session", async () => {
      authService.validateUser = jest
        .fn()
        .mockResolvedValue({ id: "u1", email: "u1@test.com" });
      authService.login = jest.fn().mockResolvedValue({ access_token: "t" });
      authService.setAuthCookie = jest.fn();
      authService.getUserFromRequest.mockReturnValue(null); // cookie not on req yet

      const result = await resolver.login({ res: {} }, "u1@test.com", "pw");

      await expect(resolver.email(result, ctx)).resolves.toBe("u1@test.com");
    });
  });

  describe("media mutations", () => {
    it.each([
      ["uploadAvatar", () => resolver.uploadAvatar(ctx, "u1", IMG)],
      ["uploadCoverImage", () => resolver.uploadCoverImage(ctx, "u1", IMG)],
      [
        "uploadCV",
        () => resolver.uploadCV(ctx, "u1", "data:application/pdf;base64,AA"),
      ],
      ["deleteCV", () => resolver.deleteCV(ctx, "u1")],
    ])("%s rejects another user", async (_name, call) => {
      asUser("attacker");
      await expect(call()).rejects.toThrow(ForbiddenException);
      expect(cloudinary.uploadBase64).not.toHaveBeenCalled();
      expect(cloudinary.uploadPdf).not.toHaveBeenCalled();
      expect(usersService.deleteCv).not.toHaveBeenCalled();
    });

    it("uploadAvatar works for the owner", async () => {
      asUser("u1");
      await expect(resolver.uploadAvatar(ctx, "u1", IMG)).resolves.toBe(true);
      expect(usersService.setAvatar).toHaveBeenCalledWith("u1", "https://img");
    });

    it.each(["uploadAvatar", "uploadCoverImage"] as const)(
      "%s rejects non-image base64 before uploading",
      async (method) => {
        asUser("u1");
        await expect(resolver[method](ctx, "u1", "data")).rejects.toMatchObject({
          fields: [expect.objectContaining({ code: "IMAGE_FORMAT_INVALID" })],
        });
        expect(cloudinary.uploadBase64).not.toHaveBeenCalled();
      },
    );

    it("deleteCV works for the owner", async () => {
      asUser("u1");
      await expect(resolver.deleteCV(ctx, "u1")).resolves.toBe(true);
      expect(usersService.deleteCv).toHaveBeenCalledWith("u1");
    });
  });
});
