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
