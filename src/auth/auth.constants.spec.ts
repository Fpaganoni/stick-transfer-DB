import {
  authCookieBaseOptions,
  authCookieOptions,
  expiresInToMs,
  AUTH_COOKIE_NAME,
} from "./auth.constants";

describe("auth.constants", () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.AUTH_COOKIE_CROSS_SITE;
  });

  describe("AUTH_COOKIE_NAME", () => {
    it("is a stable, non-empty cookie name", () => {
      expect(AUTH_COOKIE_NAME).toBe("st_session");
    });
  });

  describe("expiresInToMs", () => {
    it("parses seconds", () => {
      expect(expiresInToMs("30s")).toBe(30_000);
    });

    it("parses minutes", () => {
      expect(expiresInToMs("5m")).toBe(5 * 60_000);
    });

    it("parses hours", () => {
      expect(expiresInToMs("2h")).toBe(2 * 3_600_000);
    });

    it("parses days", () => {
      expect(expiresInToMs("7d")).toBe(7 * 86_400_000);
    });

    it("parses a bare number as milliseconds", () => {
      expect(expiresInToMs("3600")).toBe(3600 * 1000);
    });

    it("falls back to 1h for undefined input", () => {
      expect(expiresInToMs(undefined)).toBe(3_600_000);
    });

    it("falls back to 1h for malformed input", () => {
      expect(expiresInToMs("not-a-duration")).toBe(3_600_000);
    });
  });

  describe("authCookieOptions", () => {
    it("returns secure, cross-site cookie settings in production", () => {
      process.env.NODE_ENV = "production";

      const options = authCookieOptions(3_600_000);

      expect(options).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 3_600_000,
      });
    });

    it("relaxes to Lax+non-Secure outside production (plain HTTP dev/localhost)", () => {
      process.env.NODE_ENV = "development";

      const options = authCookieOptions(3_600_000);

      expect(options).toEqual({
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 3_600_000,
      });
    });

    it("relaxes when NODE_ENV is unset (defaults to non-production)", () => {
      const options = authCookieOptions(1000);

      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe("lax");
    });

    describe("AUTH_COOKIE_CROSS_SITE override", () => {
      it("forces SameSite=None+Secure outside production (e.g. a staging deploy)", () => {
        process.env.NODE_ENV = "staging";
        process.env.AUTH_COOKIE_CROSS_SITE = "true";

        expect(authCookieBaseOptions()).toMatchObject({ secure: true, sameSite: "none" });
      });

      it("forces Lax+non-Secure even in production when set to false", () => {
        process.env.NODE_ENV = "production";
        process.env.AUTH_COOKIE_CROSS_SITE = "false";

        expect(authCookieBaseOptions()).toMatchObject({ secure: false, sameSite: "lax" });
      });

      it.each(["", "yes", "1", "TRUE-ish"])(
        "ignores an unrecognised value (%p) and follows NODE_ENV",
        (value) => {
          process.env.NODE_ENV = "production";
          process.env.AUTH_COOKIE_CROSS_SITE = value;

          expect(authCookieBaseOptions()).toMatchObject({ secure: true, sameSite: "none" });
        },
      );

      it("is case-insensitive for true/false", () => {
        process.env.AUTH_COOKIE_CROSS_SITE = "TRUE";

        expect(authCookieBaseOptions().sameSite).toBe("none");
      });
    });

    it("always sets httpOnly regardless of environment", () => {
      process.env.NODE_ENV = "production";
      expect(authCookieOptions(1000).httpOnly).toBe(true);

      process.env.NODE_ENV = "development";
      expect(authCookieOptions(1000).httpOnly).toBe(true);
    });
  });
});
