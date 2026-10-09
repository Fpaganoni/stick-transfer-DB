import { ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
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

    describe("country and multimedia", () => {
      // Positional args after ctx/id: position #8, country #9, multimedia #13.
      const COUNTRY_ARG = 9;
      const MULTIMEDIA_ARG = 13;
      const update = (opts: { country?: string | null; multimedia?: string[] }) => {
        const args: unknown[] = [ctx, "u1"];
        args[COUNTRY_ARG] = opts.country;
        args[MULTIMEDIA_ARG] = opts.multimedia;
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

      beforeEach(() => asUser("u1"));

      it("stores the normalized country code", async () => {
        await update({ country: "es" });
        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ country: "ES" }),
        );
      });

      it("null clears the country, undefined leaves it untouched", async () => {
        await update({ country: null });
        expect(usersService.updateUser.mock.calls[0][1].country).toBeNull();
        await update({});
        expect(usersService.updateUser.mock.calls[1][1].country).toBeUndefined();
      });

      it.each([["Spain"], [""], ["🇪🇸"]])("rejects country %p with COUNTRY_INVALID", async (country) => {
        const fields = await fieldsOf(update({ country }));
        expect(fields).toEqual([expect.objectContaining({ field: "country", code: "COUNTRY_INVALID" })]);
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("keeps multimedia for a non-UMPIRE", async () => {
        await update({ multimedia: ["https://video"] });
        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ multimedia: ["https://video"] }),
        );
      });

      it.each([[["https://video"]], [[]]])(
        "rejects multimedia %p for a stored UMPIRE with FIELD_NOT_ALLOWED",
        async (multimedia) => {
          usersService.findById.mockResolvedValue({ id: "u1", role: "UMPIRE" });
          const fields = await fieldsOf(update({ multimedia }));
          expect(fields).toEqual([
            expect.objectContaining({ field: "multimedia", code: "FIELD_NOT_ALLOWED" }),
          ]);
          expect(usersService.updateUser).not.toHaveBeenCalled();
        },
      );

      it("fails with NotFound when only multimedia is sent for a missing user", async () => {
        usersService.findById.mockResolvedValue(null);
        await expect(update({ multimedia: ["https://video"] })).rejects.toThrow(NotFoundException);
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("judges multimedia by the stored role when an admin edits an umpire", async () => {
        asUser("admin", "SUPERADMIN");
        usersService.findById.mockResolvedValue({ id: "u1", role: "UMPIRE" });
        const fields = await fieldsOf(update({ multimedia: ["https://video"] }));
        expect(fields[0]).toMatchObject({ field: "multimedia", code: "FIELD_NOT_ALLOWED" });
      });
    });
  });

  describe("multimedia field", () => {
    it("is always empty for an UMPIRE", () => {
      expect(resolver.multimedia({ role: "UMPIRE", multimedia: ["https://video"] })).toEqual([]);
    });

    it("returns the stored list for other roles, [] when NULL", () => {
      expect(resolver.multimedia({ role: "PLAYER", multimedia: ["https://video"] })).toEqual([
        "https://video",
      ]);
      expect(resolver.multimedia({ role: "PLAYER", multimedia: null })).toEqual([]);
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
