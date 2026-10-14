import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy.validate", () => {
  const originalSecret = process.env.JWT_SECRET;
  let prisma: { user: { findUnique: jest.Mock } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    process.env.JWT_SECRET = "test-secret";
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(prisma as any);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it("returns the caller when the token version matches", async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 2, isActive: true });

    await expect(
      strategy.validate({ sub: "u1", role: "PLAYER", email: "a@b.com", tv: 2 }),
    ).resolves.toEqual({ userId: "u1", email: "a@b.com", role: "PLAYER" });
  });

  it("treats a token without tv as version 0", async () => {
    prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, isActive: true });

    await expect(strategy.validate({ sub: "u1", role: "PLAYER" })).resolves.toMatchObject({
      userId: "u1",
    });
  });

  it.each([
    ["a stale token version", { tokenVersion: 3, isActive: true }],
    ["a deactivated user", { tokenVersion: 2, isActive: false }],
    ["a user that no longer exists", null],
  ])("rejects %s", async (_name, user) => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: "u1", role: "PLAYER", tv: 2 }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
