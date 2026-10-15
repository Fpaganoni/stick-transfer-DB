import { UsersResolver } from "./users.resolver";
import { ClubsResolver } from "../clubs/clubs.resolver";
import { ClubsService } from "../clubs/clubs.service";
import { AppError } from "../common/errors/app.error";
import { SELF_VIEW } from "../common/self-view";

/**
 * A CLUB account IS the club: register/updateUser/isUsernameAvailable behave
 * differently for it. Prisma and the other services are mocked.
 */
describe("UsersResolver - club identity", () => {
  const STRONG = "Str0ng!Passw0rd";
  const ctx = { res: {}, req: {} };

  let usersService: any;
  let authService: any;
  let clubsService: any;
  let resolver: UsersResolver;

  beforeEach(() => {
    usersService = {
      isEmailTaken: jest.fn().mockResolvedValue(false),
      isUsernameTaken: jest.fn().mockResolvedValue(false),
      createUser: jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com", role: "CLUB" }),
      findById: jest.fn().mockResolvedValue({ id: "u1", role: "PLAYER" }),
      updateUser: jest.fn().mockResolvedValue({ id: "u1" }),
      assertActiveClubMember: jest.fn(),
    };
    authService = {
      getUserFromRequest: jest.fn().mockReturnValue(null),
      login: jest.fn().mockResolvedValue({ access_token: "t" }),
      setAuthCookie: jest.fn(),
    };
    clubsService = {
      assertClubNameAvailable: jest.fn().mockResolvedValue(undefined),
      assertClubIdentityUpdate: jest.fn().mockResolvedValue({}),
      notifyPendingVerification: jest.fn().mockResolvedValue(undefined),
      create: jest.fn(),
      resetLoaders: jest.fn(),
      loadClubProfile: jest.fn(),
    };
    resolver = new UsersResolver(
      usersService, authService, {} as any, {} as any, clubsService, {} as any,
    );
  });

  const asUser = (userId: string, role = "PLAYER") =>
    authService.getUserFromRequest.mockReturnValue({ userId, role });

  const rejectionOf = async (promise: Promise<unknown>): Promise<AppError> => {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      return error as AppError;
    }
    throw new Error("expected rejection");
  };

  describe("isUsernameAvailable", () => {
    it("passes the normalized username and the session user id as the exclusion", async () => {
      asUser("u1");

      await resolver.isUsernameAvailable(ctx, " Free_One ");

      expect(usersService.isUsernameTaken).toHaveBeenCalledWith("free_one", "u1");
    });

    it("is available to the caller when only the caller has the username", async () => {
      asUser("me");
      usersService.isUsernameTaken.mockImplementation(
        async (_username: string, excludeUserId?: string) => excludeUserId !== "me",
      );

      await expect(resolver.isUsernameAvailable(ctx, "my_name")).resolves.toBe(true);
    });

    it("is not available to the caller when another user has it", async () => {
      asUser("other");
      usersService.isUsernameTaken.mockResolvedValue(true);

      await expect(resolver.isUsernameAvailable(ctx, "my_name")).resolves.toBe(false);
    });

    it("passes undefined as the exclusion for anonymous callers", async () => {
      await resolver.isUsernameAvailable(ctx, "free_one");

      expect(usersService.isUsernameTaken).toHaveBeenCalledWith("free_one", undefined);
    });

    it.each(["a", "has space", "UPPER-dash", "admin"])(
      "rejects the invalid username %p with VALIDATION_ERROR and never queries",
      async (username) => {
        asUser("u1");

        const error = await rejectionOf(resolver.isUsernameAvailable(ctx, username));

        expect(error.code).toBe("VALIDATION_ERROR");
        expect(usersService.isUsernameTaken).not.toHaveBeenCalled();
      },
    );
  });

  describe("register as CLUB", () => {
    // Positional: role, country, city, position, dateOfBirth, clubName, first, last
    const registerClub = (
      overrides: {
        name?: string;
        clubName?: string;
        first?: string;
        last?: string;
        country?: string;
        city?: string;
      } = {},
    ) =>
      resolver.register(
        ctx, "a@b.com", overrides.name ?? "ignored", undefined, STRONG, "club",
        "country" in overrides ? overrides.country : "es",
        "city" in overrides ? overrides.city : " Madrid ",
        undefined, undefined,
        "clubName" in overrides ? overrides.clubName : "Club Uno",
        "first" in overrides ? overrides.first : " Ana ",
        "last" in overrides ? overrides.last : " Lopez ",
      );

    it("uses the trimmed, space-collapsed clubName as the account name", async () => {
      await registerClub({ clubName: "  Club   de  Campo " });

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Club de Campo" }),
      );
      expect(clubsService.assertClubNameAvailable).toHaveBeenCalledWith(
        "Club de Campo", null, "clubName",
      );
    });

    it.each([[""], ["   "], ["x".repeat(500)], ["Real Person Name"]])(
      "ignores the name argument %p",
      async (name) => {
        await registerClub({ name, clubName: "Club Uno" });

        expect(usersService.createUser).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Club Uno" }),
        );
      },
    );

    it.each([[""], ["   "], [undefined]])(
      "requires clubName (%p) with FIELD_REQUIRED on field clubName",
      async (clubName) => {
        const error = await rejectionOf(registerClub({ clubName: clubName as any }));

        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.fields).toEqual([
          expect.objectContaining({ field: "clubName", code: "FIELD_REQUIRED" }),
        ]);
        expect(usersService.createUser).not.toHaveBeenCalled();
      },
    );

    it("reports a clubName over 100 chars as NAME_TOO_LONG under clubName, not name", async () => {
      const error = await rejectionOf(registerClub({ clubName: "x".repeat(101) }));

      expect(error.fields).toEqual([
        expect.objectContaining({ field: "clubName", code: "NAME_TOO_LONG" }),
      ]);
      expect(error.fields?.some((f) => f.field === "name")).toBe(false);
    });

    it("accepts a clubName of exactly 100 chars", async () => {
      await registerClub({ clubName: "x".repeat(100) });

      expect(usersService.createUser).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["managedByFirstName", { first: undefined }],
      ["managedByFirstName", { first: "   " }],
      ["managedByLastName", { last: undefined }],
      ["managedByLastName", { last: "  " }],
    ])("requires %s (missing or whitespace-only)", async (field, overrides) => {
      const error = await rejectionOf(registerClub(overrides));

      expect(error.fields).toEqual([expect.objectContaining({ field, code: "FIELD_REQUIRED" })]);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it("also requires country and city", async () => {
      const error = await rejectionOf(registerClub({ country: undefined, city: "  " }));

      expect(error.fields?.map((f) => f.field).sort()).toEqual(["city", "country"]);
    });

    it("calls createUser ONCE with a trimmed clubProfile and role CLUB, and never clubsService.create", async () => {
      await registerClub();

      expect(usersService.createUser).toHaveBeenCalledTimes(1);
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          role: "CLUB",
          city: "Madrid",
          country: "ES",
          clubProfile: { managedByFirstName: "Ana", managedByLastName: "Lopez" },
        }),
      );
      expect(clubsService.create).not.toHaveBeenCalled();
    });

    it("notifies the super admins about the pending verification of the new account", async () => {
      await registerClub();

      expect(clubsService.notifyPendingVerification).toHaveBeenCalledWith("u1");
    });

    it("throws CLUB_NAME_TAKEN under clubName from the pre-check without creating anything", async () => {
      clubsService.assertClubNameAvailable.mockRejectedValue(AppError.clubNameTaken("clubName"));

      const error = await rejectionOf(registerClub({ clubName: "CLUB uno" }));

      expect(error).toMatchObject({ code: "CLUB_NAME_TAKEN", field: "clubName" });
      expect(error.getStatus()).toBe(409);
      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(clubsService.notifyPendingVerification).not.toHaveBeenCalled();
    });

    it("maps a clubNameKey unique race to CLUB_NAME_TAKEN under clubName", async () => {
      usersService.createUser.mockRejectedValue({
        code: "P2002",
        meta: { target: ["clubNameKey"] },
      });

      const error = await rejectionOf(registerClub());

      expect(error).toMatchObject({ code: "CLUB_NAME_TAKEN", field: "clubName" });
      expect(clubsService.notifyPendingVerification).not.toHaveBeenCalled();
    });

    it("returns a user carrying SELF_VIEW and sets the session cookie", async () => {
      const result = await registerClub();

      expect((result as any)[SELF_VIEW]).toBe(true);
      expect(authService.setAuthCookie).toHaveBeenCalledWith(ctx.res, "t");
    });

    it("lets the just-registered owner see managedBy through the clubProfile resolver", async () => {
      clubsService.loadClubProfile.mockResolvedValue({
        id: "u1",
        managedByFirstName: "Ana",
        managedByLastName: "Lopez",
      });
      const registered = await registerClub();
      const profile = await resolver.clubProfile(registered, ctx);
      // The cookie is not on the request yet: the anonymous viewer is the session
      const clubsResolver = new ClubsResolver(
        {} as any, {} as any, {} as any, authService, {} as any,
      );

      expect(clubsResolver.managedBy(profile, ctx)).toEqual({ firstName: "Ana", lastName: "Lopez" });
    });
  });

  describe("register as a non-CLUB role", () => {
    const registerAs = (role: string | undefined, name: string) =>
      resolver.register(ctx, "a@b.com", name, undefined, STRONG, role);

    it.each([["PLAYER"], ["COACH"], ["UMPIRE"], [undefined]])(
      "validates `name` for %p and never passes clubProfile",
      async (role) => {
        await registerAs(role, "  Ana Perez ");

        const data = usersService.createUser.mock.calls[0][0];
        expect(data.name).toBe("Ana Perez");
        expect(data.clubProfile).toBeUndefined();
        expect(clubsService.assertClubNameAvailable).not.toHaveBeenCalled();
        expect(clubsService.notifyPendingVerification).not.toHaveBeenCalled();
      },
    );

    it("reports a blank name as NAME_REQUIRED on field name", async () => {
      const error = await rejectionOf(registerAs("PLAYER", "   "));

      expect(error.fields).toEqual([expect.objectContaining({ field: "name", code: "NAME_REQUIRED" })]);
    });

    it("reports a name over 100 chars as NAME_TOO_LONG on field name", async () => {
      const error = await rejectionOf(registerAs("COACH", "x".repeat(101)));

      expect(error.fields).toEqual([expect.objectContaining({ field: "name", code: "NAME_TOO_LONG" })]);
    });

    it("ignores clubName and manager fields", async () => {
      await resolver.register(
        ctx, "a@b.com", "Ana", undefined, STRONG, "PLAYER", undefined, undefined,
        undefined, undefined, "Some Club", "X", "Y",
      );

      const data = usersService.createUser.mock.calls[0][0];
      expect(data.name).toBe("Ana");
      expect(data.clubProfile).toBeUndefined();
    });
  });

  describe("updateUser", () => {
    // Positional args after (ctx, id): name, username, bio, avatar, coverImage,
    // coverImagePosition, position, country, city
    const POSITIONS = { name: 0, country: 7, city: 8 } as const;
    const update = (fields: { name?: string; country?: string | null; city?: string | null }) => {
      const args: unknown[] = new Array(9).fill(undefined);
      for (const [key, value] of Object.entries(fields)) {
        args[POSITIONS[key as keyof typeof POSITIONS]] = value;
      }
      return (resolver as any).updateUser(ctx, "u1", ...args);
    };

    beforeEach(() => asUser("u1", "CLUB"));

    describe("on a stored CLUB (shared identity rules)", () => {
      beforeEach(() => {
        usersService.findById.mockResolvedValue({ id: "u1", role: "CLUB" });
      });

      it("runs assertClubIdentityUpdate and stores the normalized name", async () => {
        clubsService.assertClubIdentityUpdate.mockResolvedValue({ name: "Club Norte" });

        await update({ name: "  club   Norte " });

        expect(clubsService.assertClubIdentityUpdate).toHaveBeenCalledWith("u1", {
          name: "  club   Norte ",
          city: undefined,
          country: undefined,
        });
        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ name: "Club Norte" }),
        );
      });

      it("stores the normalized city and country returned by the shared rule", async () => {
        clubsService.assertClubIdentityUpdate.mockResolvedValue({ city: "Madrid", country: "ES" });

        await update({ city: " Madrid ", country: "es" });

        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ city: "Madrid", country: "ES" }),
        );
      });

      it("propagates CLUB_NAME_TAKEN and saves nothing", async () => {
        clubsService.assertClubIdentityUpdate.mockRejectedValue(AppError.clubNameTaken("name"));

        await expect(update({ name: "Taken" })).rejects.toMatchObject({
          code: "CLUB_NAME_TAKEN",
          field: "name",
        });
        expect(usersService.updateUser).not.toHaveBeenCalled();
        expect(clubsService.resetLoaders).not.toHaveBeenCalled();
      });

      it("maps a clubNameKey unique race raised by the save to CLUB_NAME_TAKEN", async () => {
        usersService.updateUser.mockRejectedValue({ code: "P2002", meta: { target: ["clubNameKey"] } });

        await expect(update({ name: "Racy" })).rejects.toMatchObject({
          code: "CLUB_NAME_TAKEN",
          field: "name",
        });
      });

      it("resets the request's owner loaders after saving", async () => {
        await update({ name: "Club Norte" });

        expect(clubsService.resetLoaders).toHaveBeenCalledWith(ctx);
      });

      it("judges by the stored role when a super admin edits the club", async () => {
        asUser("admin", "SUPERADMIN");

        await update({ name: "Moderated" });

        expect(clubsService.assertClubIdentityUpdate).toHaveBeenCalledWith("u1", expect.anything());
      });
    });

    describe("on a stored CLUB with the real identity rule", () => {
      let prisma: any;

      beforeEach(() => {
        prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
        const realClubs = new ClubsService(prisma, { emit: jest.fn() } as any);
        resolver = new UsersResolver(
          usersService, authService, {} as any, {} as any, realClubs, {} as any,
        );
        usersService.findById.mockResolvedValue({ id: "u1", role: "CLUB" });
      });

      it("rejects country null with a validation error and saves nothing", async () => {
        const error = await rejectionOf(update({ country: null }));

        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.fields?.[0]).toMatchObject({ field: "country" });
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it.each([[""], ["   "]])("rejects a blank city %p and saves nothing", async (city) => {
        const error = await rejectionOf(update({ city }));

        expect(error.fields?.[0]).toMatchObject({ field: "city", code: "FIELD_REQUIRED" });
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("rejects a null city and saves nothing", async () => {
        const error = await rejectionOf(update({ city: null }));

        expect(error.fields?.[0]).toMatchObject({ field: "city", code: "FIELD_REQUIRED" });
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("turns a name taken by another club (any case/spacing/accents) into CLUB_NAME_TAKEN", async () => {
        prisma.user.findFirst.mockResolvedValue({ id: "other" });

        await expect(update({ name: " CLÚB   uno " })).rejects.toMatchObject({
          code: "CLUB_NAME_TAKEN",
          field: "name",
        });
        expect(prisma.user.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { clubNameKey: "club uno", NOT: { id: "u1" } } }),
        );
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("lets the club keep its own name in a different case", async () => {
        await update({ name: "club UNO" });

        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ name: "club UNO" }),
        );
      });
    });

    describe("on a non-CLUB user", () => {
      beforeEach(() => {
        asUser("u1", "PLAYER");
        usersService.findById.mockResolvedValue({ id: "u1", role: "PLAYER" });
      });

      it("trims the name and skips the club identity rule", async () => {
        await update({ name: "  Ana Perez " });

        expect(usersService.updateUser).toHaveBeenCalledWith(
          "u1",
          expect.objectContaining({ name: "Ana Perez" }),
        );
        expect(clubsService.assertClubIdentityUpdate).not.toHaveBeenCalled();
      });

      it.each([
        ["blank", "   ", "NAME_REQUIRED"],
        ["empty", "", "NAME_REQUIRED"],
        ["over 100 chars", "x".repeat(101), "NAME_TOO_LONG"],
      ])("rejects a %s name with VALIDATION_ERROR", async (_label, name, code) => {
        const error = await rejectionOf(update({ name }));

        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.fields).toEqual([expect.objectContaining({ field: "name", code })]);
        expect(usersService.updateUser).not.toHaveBeenCalled();
      });

      it("still lets a player clear the country with null", async () => {
        await update({ country: null });

        expect(usersService.updateUser.mock.calls[0][1].country).toBeNull();
      });

      it("fails with NotFound when the user to edit does not exist", async () => {
        usersService.findById.mockResolvedValue(null);

        await expect(update({ city: "Rosario" })).rejects.toThrow("User not found");
      });
    });
  });

  describe("clubProfile field", () => {
    const club = { id: "u1", managedByFirstName: "Ana", managedByLastName: "Lopez" };

    it.each(["PLAYER", "COACH", "UMPIRE", "SUPERADMIN"])(
      "is null for a %s without querying",
      async (role) => {
        await expect(resolver.clubProfile({ id: "u1", role }, ctx)).resolves.toBeNull();

        expect(clubsService.loadClubProfile).not.toHaveBeenCalled();
      },
    );

    it("returns the club profile of a CLUB user", async () => {
      clubsService.loadClubProfile.mockResolvedValue(club);

      const profile = await resolver.clubProfile({ id: "u1", role: "CLUB" }, ctx);

      expect(clubsService.loadClubProfile).toHaveBeenCalledWith(ctx, "u1");
      expect(profile).toBe(club);
      expect((profile as any)[SELF_VIEW]).toBeUndefined();
    });

    it("carries SELF_VIEW from the user to the profile, on a copy", async () => {
      clubsService.loadClubProfile.mockResolvedValue(club);

      const profile: any = await resolver.clubProfile({ id: "u1", role: "CLUB", [SELF_VIEW]: true }, ctx);

      expect(profile[SELF_VIEW]).toBe(true);
      expect(profile).not.toBe(club);
      expect((club as any)[SELF_VIEW]).toBeUndefined();
    });

    it("is null when a CLUB user has no club row", async () => {
      clubsService.loadClubProfile.mockResolvedValue(null);

      await expect(
        resolver.clubProfile({ id: "u1", role: "CLUB", [SELF_VIEW]: true }, ctx),
      ).resolves.toBeNull();
    });

    it("loads the profiles of many CLUB users with ONE club.findMany", async () => {
      const prisma = {
        club: { findMany: jest.fn(async ({ where }: any) => where.id.in.map((id: string) => ({ id }))) },
      };
      const realClubs = new ClubsService(prisma as any, { emit: jest.fn() } as any);
      const batched = new UsersResolver(
        usersService, authService, {} as any, {} as any, realClubs, {} as any,
      );
      const users = Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, role: "CLUB" }));
      const players = [{ id: "p1", role: "PLAYER" }];

      const profiles = await Promise.all([...users, ...players].map((u) => batched.clubProfile(u, ctx)));

      expect(prisma.club.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.club.findMany.mock.calls[0][0].where.id.in).toHaveLength(25);
      expect(profiles.slice(0, 25).every((p) => p !== null)).toBe(true);
      expect(profiles[25]).toBeNull();
    });
  });

  describe("person fields are forbidden for a CLUB", () => {
    // Positional args after (ctx, id) of updateUser, see users.resolver.ts
    const ARG_INDEX = {
      position: 6,
      yearsOfExperience: 10,
      multimedia: 11,
      cvUrl: 12,
      dateOfBirth: 13,
      level: 14,
      trajectories: 15,
      licenseLevel: 16,
      certifyingBody: 17,
      licenseNumber: 18,
      certificationYear: 19,
      matchesOfficiated: 20,
      travelAvailability: 21,
      languages: 22,
      modalities: 23,
      umpireCategories: 24,
      umpireCertifications: 25,
    } as const;
    type PersonField = keyof typeof ARG_INDEX;
    const SAMPLE: Record<PersonField, unknown> = {
      position: "attacker",
      yearsOfExperience: 3,
      multimedia: ["https://x.test/a.jpg"],
      cvUrl: "https://x.test/cv.pdf",
      dateOfBirth: "2000-01-01",
      level: "pro",
      trajectories: [{}],
      licenseLevel: "A",
      certifyingBody: "FIH",
      licenseNumber: "123",
      certificationYear: 2020,
      matchesOfficiated: 10,
      travelAvailability: "yes",
      languages: ["es"],
      modalities: ["OUTDOOR"],
      umpireCategories: ["senior"],
      umpireCertifications: [{}],
    };
    const updateWith = (fields: Partial<Record<PersonField, unknown>>) => {
      const args: unknown[] = new Array(26).fill(undefined);
      for (const [key, value] of Object.entries(fields)) {
        args[ARG_INDEX[key as PersonField]] = value;
      }
      return (resolver as any).updateUser(ctx, "u1", ...args);
    };

    beforeEach(() => {
      asUser("u1", "CLUB");
      usersService.findById.mockResolvedValue({ id: "u1", role: "CLUB" });
    });

    it.each(Object.keys(ARG_INDEX) as PersonField[])(
      "updateUser rejects %s with FIELD_NOT_ALLOWED and saves nothing",
      async (field) => {
        const error = await rejectionOf(updateWith({ [field]: SAMPLE[field] }));

        expect(error.code).toBe("VALIDATION_ERROR");
        expect(error.fields).toEqual([expect.objectContaining({ field, code: "FIELD_NOT_ALLOWED" })]);
        expect(usersService.updateUser).not.toHaveBeenCalled();
      },
    );

    it("rejects a null person field as well (clearing is not allowed either)", async () => {
      const error = await rejectionOf(updateWith({ position: null }));

      expect(error.fields).toEqual([expect.objectContaining({ field: "position" })]);
    });

    it("reports every forbidden field of one call together", async () => {
      const error = await rejectionOf(updateWith({ dateOfBirth: "2000-01-01", cvUrl: "x" }));

      expect(error.fields?.map((f) => f.field).sort()).toEqual(["cvUrl", "dateOfBirth"]);
    });

    it("reports an invalid dateOfBirth of a CLUB once, as FIELD_NOT_ALLOWED only", async () => {
      const error = await rejectionOf(updateWith({ dateOfBirth: "not-a-date" }));

      expect(error.fields).toEqual([
        expect.objectContaining({ field: "dateOfBirth", code: "FIELD_NOT_ALLOWED" }),
      ]);
    });

    it("still reports an invalid dateOfBirth of a PLAYER as a format error", async () => {
      asUser("u1", "PLAYER");
      usersService.findById.mockResolvedValue({ id: "u1", role: "PLAYER" });

      const error = await rejectionOf(updateWith({ dateOfBirth: "not-a-date" }));

      expect(error.fields?.[0]).toMatchObject({ field: "dateOfBirth", code: "DATE_OF_BIRTH_INVALID" });
    });

    it("judges by the stored role when a super admin edits the club", async () => {
      asUser("admin", "SUPERADMIN");

      const error = await rejectionOf(updateWith({ level: "pro" }));

      expect(error.fields?.[0]).toMatchObject({ field: "level", code: "FIELD_NOT_ALLOWED" });
    });

    it("lets a PLAYER keep sending the same fields", async () => {
      asUser("u1", "PLAYER");
      usersService.findById.mockResolvedValue({ id: "u1", role: "PLAYER" });

      await updateWith({ level: "pro", yearsOfExperience: 3, cvUrl: "https://x.test/cv.pdf" });

      expect(usersService.updateUser).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["position", "attacker", undefined],
      ["dateOfBirth", undefined, "2000-01-01"],
    ])("register as CLUB rejects %s with FIELD_NOT_ALLOWED", async (field, position, dateOfBirth) => {
      const error = await rejectionOf(
        resolver.register(
          ctx, "a@b.com", "x", undefined, STRONG, "club", "es", "Madrid",
          position, dateOfBirth, "Club Uno", "Ana", "Lopez",
        ),
      );

      expect(error.fields).toEqual([expect.objectContaining({ field, code: "FIELD_NOT_ALLOWED" })]);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it("uploadCV rejects a CLUB with FIELD_NOT_ALLOWED and never calls Cloudinary", async () => {
      const cloudinary = { uploadPdf: jest.fn() };
      const withCloudinary = new UsersResolver(
        usersService, authService, cloudinary as any, {} as any, clubsService, {} as any,
      );

      const error = await rejectionOf(
        withCloudinary.uploadCV(ctx, "u1", "data:application/pdf;base64,AAAA"),
      );

      expect(error.fields).toEqual([
        expect.objectContaining({ field: "cvUrl", code: "FIELD_NOT_ALLOWED" }),
      ]);
      expect(cloudinary.uploadPdf).not.toHaveBeenCalled();
    });
  });

  describe("single social axis of a club account", () => {
    let socialService: any;
    let socialResolver: UsersResolver;
    const club = { id: "c1", role: "CLUB" };
    const player = { id: "p1", role: "PLAYER" };

    beforeEach(() => {
      socialService = {
        loadFollowersCount: jest.fn().mockResolvedValue(7),
        loadIsFollowing: jest.fn().mockResolvedValue(true),
        countFollowing: jest.fn().mockResolvedValue(2),
        getFollowers: jest.fn().mockResolvedValue([]),
        getFollowing: jest.fn().mockResolvedValue([]),
      };
      socialResolver = new UsersResolver(
        usersService, authService, {} as any, {} as any, clubsService, socialService,
      );
    });

    it("counts the followers of a CLUB account on the CLUB axis", async () => {
      await socialResolver.followersCount(club, ctx);

      expect(socialService.loadFollowersCount).toHaveBeenCalledWith(ctx, "CLUB", "c1");
    });

    it("keeps the USER axis for every other role", async () => {
      await socialResolver.followersCount(player, ctx);

      expect(socialService.loadFollowersCount).toHaveBeenCalledWith(ctx, "USER", "p1");
    });

    it("gives User.followersCount and Club.followersCount the same number for one club", async () => {
      const clubsResolver = new ClubsResolver(
        {} as any, {} as any, {} as any, authService, socialService,
      );

      const viaUser = await socialResolver.followersCount(club, ctx);
      const viaClub = await clubsResolver.followersCount({ id: "c1" }, ctx);

      expect(viaUser).toBe(viaClub);
      expect(socialService.loadFollowersCount.mock.calls.map((c: unknown[]) => c.slice(1))).toEqual([
        ["CLUB", "c1"],
        ["CLUB", "c1"],
      ]);
    });

    it("reads following, followers and the viewer flag of a club on the CLUB axis", async () => {
      asUser("viewer");

      await socialResolver.followingCount(club);
      await socialResolver.followers(club, 10, 0);
      await socialResolver.following(club, 10, 0);
      await socialResolver.isFollowedByCurrentUser(club, ctx);

      expect(socialService.countFollowing).toHaveBeenCalledWith("CLUB", "c1");
      expect(socialService.getFollowers).toHaveBeenCalledWith("CLUB", "c1", { limit: 10, offset: 0 });
      expect(socialService.getFollowing).toHaveBeenCalledWith("CLUB", "c1", { limit: 10, offset: 0 });
      expect(socialService.loadIsFollowing).toHaveBeenCalledWith(ctx, "viewer", "CLUB", "c1");
    });
  });

  describe("one club name validation for register and updateClub", () => {
    let realClubs: ClubsService;
    let realResolver: UsersResolver;

    beforeEach(() => {
      const prisma = { user: { findFirst: jest.fn().mockResolvedValue(null) } };
      realClubs = new ClubsService(prisma as any, { emit: jest.fn() } as any);
      jest.spyOn(realClubs, "notifyPendingVerification").mockResolvedValue(undefined);
      realResolver = new UsersResolver(
        usersService, authService, {} as any, {} as any, realClubs, {} as any,
      );
    });

    const registerWithName = (clubName: string) =>
      realResolver.register(
        ctx, "a@b.com", "ignored", undefined, STRONG, "club", "es", "Madrid",
        undefined, undefined, clubName, "Ana", "Lopez",
      );

    it.each([
      ["a name over 100 chars", "x".repeat(101), "NAME_TOO_LONG"],
      ["an invisible character", "Club​Uno", "NAME_INVALID"],
      ["a control character", "Club\u0007Uno", "NAME_INVALID"],
    ])("rejects %s with the same code and message through both paths", async (_label, name, code) => {
      const viaRegister = await rejectionOf(registerWithName(name));
      const viaUpdate = await rejectionOf(realClubs.assertClubIdentityUpdate("u1", { name }));

      expect(viaRegister.fields).toEqual([expect.objectContaining({ field: "clubName", code })]);
      expect(viaUpdate.fields).toEqual([expect.objectContaining({ field: "name", code })]);
      expect(viaRegister.fields?.[0].message).toBe(viaUpdate.fields?.[0].message);
    });

    it("stores the same normalized name through both paths", async () => {
      await registerWithName("  Club   de  Campo ");
      const patch = await realClubs.assertClubIdentityUpdate("u1", { name: "  Club   de  Campo " });

      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ name: patch.name }),
      );
      expect(patch.name).toBe("Club de Campo");
    });
  });
});
