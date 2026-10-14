import { UnauthorizedException } from "@nestjs/common";
import { GoogleStrategy } from "./google.strategy";

describe("GoogleStrategy.validate", () => {
  const originalEnv = { ...process.env };
  let authService: { oauthLogin: jest.Mock };
  let strategy: GoogleStrategy;

  const run = (profile: any) =>
    new Promise<{ err: Error | null; user?: any }>((resolve) => {
      strategy.validate("at", "rt", profile, (err, user) => resolve({ err, user }));
    });

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    process.env.GOOGLE_CLIENT_SECRET = "client-secret";
    authService = { oauthLogin: jest.fn().mockResolvedValue({ access_token: "jwt" }) };
    strategy = new GoogleStrategy(authService as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each([
    [{ value: "a@b.com", verified: true }, undefined, true],
    [{ value: "a@b.com", verified: "true" }, undefined, true],
    [{ value: "a@b.com", verified: false }, undefined, false],
    [{ value: "a@b.com" }, { email_verified: true }, true],
    [{ value: "a@b.com" }, undefined, false],
  ])("maps %j / %j to emailVerified=%p", async (email, json, expected) => {
    await run({ id: "g-1", displayName: "A", emails: [email], _json: json });

    expect(authService.oauthLogin).toHaveBeenCalledWith(
      expect.objectContaining({ email: "a@b.com", emailVerified: expected, socialId: "g-1" }),
    );
  });

  it("rejects a profile without an email", async () => {
    const { err, user } = await run({ id: "g-1", emails: [] });

    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(user).toBe(false);
    expect(authService.oauthLogin).not.toHaveBeenCalled();
  });
});
