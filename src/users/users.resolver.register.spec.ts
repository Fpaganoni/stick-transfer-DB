import { UsersResolver } from "./users.resolver";
import { AppError } from "../common/errors/app.error";

describe("UsersResolver - register/login/availability", () => {
  let resolver: UsersResolver;
  let usersService: any;
  let authService: any;
  const ctx = { res: {} };
  const STRONG = "Str0ng!Passw0rd";

  beforeEach(() => {
    usersService = {
      isEmailTaken: jest.fn().mockResolvedValue(false),
      isUsernameTaken: jest.fn().mockResolvedValue(false),
      createUser: jest.fn().mockResolvedValue({ id: "u1", email: "a@b.com" }),
    };
    authService = {
      validateUser: jest.fn(),
      login: jest.fn().mockResolvedValue({ access_token: "t" }),
      setAuthCookie: jest.fn(),
    };
    resolver = new UsersResolver(usersService, authService, {} as any, {} as any, {} as any, {} as any);
  });

  const codeOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      return e as AppError;
    }
    throw new Error("expected rejection");
  };

  describe("register", () => {
    it("rejects bad input with per-field errors and never touches the DB", async () => {
      const err = await codeOf(resolver.register(ctx, "bad", "Ana", "x", "weak"));
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields?.map((f) => f.code).sort()).toEqual([
        "EMAIL_INVALID",
        "PASSWORD_TOO_SHORT",
        "USERNAME_INVALID",
      ]);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it("stores the normalized email and username", async () => {
      await resolver.register(ctx, " A@B.com ", "Ana", "Ana_9", STRONG);
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: "a@b.com", username: "ana_9" }),
      );
    });

    it("returns EMAIL_TAKEN / USERNAME_TAKEN", async () => {
      usersService.isEmailTaken.mockResolvedValue(true);
      expect((await codeOf(resolver.register(ctx, "a@b.com", "Ana", undefined, STRONG))).code).toBe("EMAIL_TAKEN");
      usersService.isEmailTaken.mockResolvedValue(false);
      usersService.isUsernameTaken.mockResolvedValue(true);
      expect((await codeOf(resolver.register(ctx, "a@b.com", "Ana", "ana_9", STRONG))).code).toBe("USERNAME_TAKEN");
    });

    it("maps a P2002 race to EMAIL_TAKEN", async () => {
      usersService.createUser.mockRejectedValue({ code: "P2002", meta: { target: ["email"] } });
      expect((await codeOf(resolver.register(ctx, "a@b.com", "Ana", undefined, STRONG))).code).toBe("EMAIL_TAKEN");
    });

    it("reports invalid role and missing CLUB fields as field errors", async () => {
      const role = await codeOf(resolver.register(ctx, "a@b.com", "Ana", undefined, STRONG, "WIZARD"));
      expect(role.fields?.[0]).toMatchObject({ field: "role", code: "ROLE_INVALID" });
      const club = await codeOf(resolver.register(ctx, "a@b.com", "Ana", undefined, STRONG, "club"));
      expect(club.fields?.map((f) => f.field)).toEqual(
        expect.arrayContaining(["clubName", "country", "city", "managedByFirstName", "managedByLastName"]),
      );
    });
  });

  describe("register - dateOfBirth and position", () => {
    // Frozen clock: "today" is 2026-10-09 (UTC).
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-09T12:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const registerWith = (
      dateOfBirth?: string,
      role?: string,
      position?: string,
      email = "a@b.com",
    ) =>
      resolver.register(
        ctx, email, "Ana", undefined, STRONG, role, undefined, undefined, position, dateOfBirth,
      );

    it.each(["1800-01-01", "2030-01-01", "2011-10-09", "2001-02-30", "01/02/2000"])(
      "rejects dateOfBirth %p with VALIDATION_ERROR on field dateOfBirth",
      async (dob) => {
        const err = await codeOf(registerWith(dob));
        expect(err.code).toBe("VALIDATION_ERROR");
        expect(err.getStatus()).toBe(400);
        expect(err.fields?.map((f) => f.field)).toEqual(["dateOfBirth"]);
        expect(usersService.createUser).not.toHaveBeenCalled();
      },
    );

    it("maps each dateOfBirth failure to its code", async () => {
      expect((await codeOf(registerWith("1800-01-01"))).fields?.[0].code).toBe("DATE_OF_BIRTH_TOO_OLD");
      expect((await codeOf(registerWith("2030-01-01"))).fields?.[0].code).toBe("DATE_OF_BIRTH_TOO_YOUNG");
      expect((await codeOf(registerWith("2001-02-30"))).fields?.[0].code).toBe("DATE_OF_BIRTH_INVALID");
    });

    it("accepts exactly 16 years old today", async () => {
      await registerWith("2010-10-09");
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ dateOfBirth: "2010-10-09" }),
      );
    });

    it("returns dateOfBirth and other errors in a single VALIDATION_ERROR", async () => {
      const err = await codeOf(registerWith("2030-01-01", "WIZARD", undefined, "bad"));
      expect(err.fields?.map((f) => f.code).sort()).toEqual([
        "DATE_OF_BIRTH_TOO_YOUNG",
        "EMAIL_INVALID",
        "ROLE_INVALID",
      ]);
    });

    it("does not hit the email lookup when dateOfBirth is invalid", async () => {
      await codeOf(registerWith("1800-01-01"));
      expect(usersService.isEmailTaken).not.toHaveBeenCalled();
    });

    it("stores null position for a COACH that sends one", async () => {
      await registerWith("1990-05-05", "coach", "goalkeeper");
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ role: "COACH", position: null }),
      );
    });

    it("keeps a valid position for a PLAYER (explicit and default role)", async () => {
      await registerWith(undefined, "PLAYER", "attacker");
      expect(usersService.createUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ role: "PLAYER", position: "attacker" }),
      );
      await registerWith(undefined, undefined, "defender");
      expect(usersService.createUser).toHaveBeenLastCalledWith(
        expect.objectContaining({ position: "defender" }),
      );
    });

    it("treats a blank role as the default PLAYER for the position rule", async () => {
      const err = await codeOf(registerWith(undefined, "  ", "Forward"));
      expect(err.fields?.[0]).toMatchObject({ field: "position", code: "POSITION_INVALID" });
    });

    it("rejects an invalid PLAYER position with POSITION_INVALID", async () => {
      const err = await codeOf(registerWith(undefined, "PLAYER", "Forward"));
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields?.[0]).toMatchObject({ field: "position", code: "POSITION_INVALID" });
      expect(usersService.createUser).not.toHaveBeenCalled();
    });
  });

  describe("register - country", () => {
    const registerWith = (role: string | undefined, country?: string, clubFields = false) =>
      resolver.register(
        ctx, "a@b.com", "Ana", undefined, STRONG, role, country, clubFields ? "Madrid" : undefined,
        undefined, undefined,
        clubFields ? "Club" : undefined, clubFields ? "Ana" : undefined, clubFields ? "Lopez" : undefined,
      );

    it("stores the normalized code ('ar' -> 'AR')", async () => {
      await registerWith("PLAYER", " ar ");
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ country: "AR" }),
      );
    });

    it("leaves country undefined when not sent", async () => {
      await registerWith("PLAYER");
      expect(usersService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ country: undefined }),
      );
    });

    it("rejects a non-code country with COUNTRY_INVALID and never touches the DB", async () => {
      const err = await codeOf(registerWith("PLAYER", "Argentina"));
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.fields).toEqual([expect.objectContaining({ field: "country", code: "COUNTRY_INVALID" })]);
      expect(usersService.isEmailTaken).not.toHaveBeenCalled();
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it("creates a CLUB's club profile with the normalized code", async () => {
      const clubsService = { create: jest.fn().mockResolvedValue({}) };
      resolver = new UsersResolver(
        usersService, authService, {} as any, {} as any, clubsService as any, {} as any,
      );
      await registerWith("CLUB", "gb-eng", true);
      expect(clubsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ country: "GB-ENG" }),
      );
    });
  });

  describe("login", () => {
    it("throws INVALID_CREDENTIALS (401) when validateUser returns null", async () => {
      authService.validateUser.mockResolvedValue(null);
      const err = await codeOf(resolver.login(ctx, "a@b.com", "x"));
      expect(err.code).toBe("INVALID_CREDENTIALS");
      expect(err.getStatus()).toBe(401);
    });
  });

  describe("availability queries", () => {
    it("isEmailAvailable validates format and reports availability", async () => {
      expect((await codeOf(resolver.isEmailAvailable("nope"))).code).toBe("VALIDATION_ERROR");
      expect(await resolver.isEmailAvailable("Free@B.com")).toBe(true);
      expect(usersService.isEmailTaken).toHaveBeenCalledWith("free@b.com");
      usersService.isEmailTaken.mockResolvedValue(true);
      expect(await resolver.isEmailAvailable("taken@b.com")).toBe(false);
    });

    it("isUsernameAvailable validates format and reports availability", async () => {
      expect((await codeOf(resolver.isUsernameAvailable("a"))).code).toBe("VALIDATION_ERROR");
      expect(await resolver.isUsernameAvailable("Free_One")).toBe(true);
      expect(usersService.isUsernameTaken).toHaveBeenCalledWith("free_one");
    });
  });
});
