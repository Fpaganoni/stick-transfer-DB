import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma.service";
import * as bcrypt from "bcrypt";

// Mock bcrypt to avoid actual hashing in unit tests (slow + unnecessary)
jest.mock("bcrypt");
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue("mocked-jwt-token"),
};

describe("AuthService", () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  // ── validateUser ──────────────────────────────────────────────────────────
  describe("validateUser", () => {
    const mockUser = {
      id: "user-1",
      email: "player@hockey.com",
      username: "puck_king",
      password: "$2b$10$hashedPassword",
      role: "PLAYER",
    };

    it("should return user when credentials are valid", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser("player@hockey.com", "password123");

      expect(result).toEqual(mockUser);
      expect(mockBcrypt.compare).toHaveBeenCalledWith("password123", mockUser.password);
    });

    it("should return null when password does not match", async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser("player@hockey.com", "wrong-pass");

      expect(result).toBeNull();
    });

    it("should return null when user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser("ghost@hockey.com", "somepass");

      expect(result).toBeNull();
      // bcrypt should NEVER be called — avoids timing side-channel on non-existent users
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it("should return null for OAuth users (password = null) — prevents bcrypt crash", async () => {
      // Critical: OAuth users have no password. Calling bcrypt.compare(pass, null) would throw.
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, password: null });

      const result = await service.validateUser("oauth@google.com", "anypass");

      expect(result).toBeNull();
      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────
  describe("login", () => {
    it("should return a signed JWT with correct payload", async () => {
      const user = { id: "user-1", username: "puck_king", role: "PLAYER" };

      const result = await service.login(user);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        username: "puck_king",
        sub: "user-1",
        role: "PLAYER",
      });
      expect(result).toEqual({ access_token: "mocked-jwt-token" });
    });
  });

  // ── oauthLogin ────────────────────────────────────────────────────────────
  describe("oauthLogin", () => {
    const googleProfile = {
      email: "coach@hockey.com",
      displayName: "Coach Franco",
      provider: "GOOGLE" as const,
      socialId: "google-sub-123",
    };

    const existingOAuthUser = {
      id: "user-oauth",
      email: "coach@hockey.com",
      username: "coach_franco",
      role: "COACH",
      authProvider: "GOOGLE",
      socialId: "google-sub-123",
    };

    it("should return JWT for returning OAuth user (fast path: socialId lookup)", async () => {
      // Step 1 hit: user found by (provider + socialId)
      prisma.user.findFirst.mockResolvedValue(existingOAuthUser);

      const result = await service.oauthLogin(googleProfile);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { authProvider: "GOOGLE", socialId: "google-sub-123" },
      });
      // findUnique (email lookup) should NOT be called — fast path exits early
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual({ access_token: "mocked-jwt-token" });
    });

    it("should link OAuth provider to existing email/password account", async () => {
      // Step 1 miss, Step 2 hit: legacy email account gets linked
      prisma.user.findFirst.mockResolvedValue(null);
      const emailUser = { id: "user-legacy", email: "coach@hockey.com", username: "old_coach" };
      prisma.user.findUnique.mockResolvedValue(emailUser);
      const linkedUser = { ...emailUser, authProvider: "GOOGLE", socialId: "google-sub-123" };
      prisma.user.update.mockResolvedValue(linkedUser);

      const result = await service.oauthLogin(googleProfile);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-legacy" },
        data: { authProvider: "GOOGLE", socialId: "google-sub-123" },
      });
      expect(result).toEqual({ access_token: "mocked-jwt-token" });
    });

    it("should create new user when no account exists", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique
        .mockResolvedValueOnce(null)  // email lookup → no existing account
        .mockResolvedValueOnce(null); // username uniqueness check → "coach_franco" is free

      const newUser = { id: "user-new", email: "coach@hockey.com", username: "coach" };
      prisma.user.create.mockResolvedValue(newUser);

      const result = await service.oauthLogin(googleProfile);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "coach@hockey.com",
            authProvider: "GOOGLE",
            socialId: "google-sub-123",
            password: null, // OAuth users NEVER have a password
          }),
        })
      );
      expect(result).toEqual({ access_token: "mocked-jwt-token" });
    });

    it("should resolve username collision by appending counter", async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique
        .mockResolvedValueOnce(null)                   // email → no account
        .mockResolvedValueOnce({ id: "taken" })        // "coach" is taken
        .mockResolvedValueOnce({ id: "also-taken" })   // "coach1" is taken
        .mockResolvedValueOnce(null);                  // "coach2" is free

      prisma.user.create.mockResolvedValue({ id: "new" });

      await service.oauthLogin(googleProfile);

      const createdData = prisma.user.create.mock.calls[0][0].data;
      expect(createdData.username).toBe("coach2");
    });

    it("should throw UnauthorizedException for new OAuth user without email", async () => {
      // Some providers/scopes can omit email. Without it we cannot register a new user.
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.oauthLogin({
          provider: "GOOGLE",
          socialId: "google-sub-999",
          // email intentionally omitted
        })
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("should resolve a returning OAuth user by socialId without email", async () => {
      const returningUser = { ...existingOAuthUser, authProvider: "GOOGLE", socialId: "google-sub-999" };
      prisma.user.findFirst.mockResolvedValue(returningUser);

      const result = await service.oauthLogin({
        provider: "GOOGLE",
        socialId: "google-sub-999",
        // no email — resolved purely via socialId lookup
      });

      expect(result).toEqual({ access_token: "mocked-jwt-token" });
    });
  });
});
