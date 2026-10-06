import { AppError } from "../../common/errors/app.error";
import {
  checkEmail,
  checkPassword,
  checkUsername,
  normalizeEmail,
  normalizeUsername,
  validateRegisterCredentials,
} from "./credentials";

describe("credentials validation", () => {
  describe("email", () => {
    it("normalizes to trimmed lowercase", () => {
      expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
    });
    it.each(["", "plain", "a@", "@b.com", "a b@c.com"])("rejects %p", (e) => {
      expect(checkEmail(e)).not.toBeNull();
    });
    it("reports EMAIL_INVALID / EMAIL_REQUIRED / EMAIL_TOO_LONG", () => {
      expect(checkEmail("nope")?.code).toBe("EMAIL_INVALID");
      expect(checkEmail("")?.code).toBe("EMAIL_REQUIRED");
      expect(checkEmail(`${"a".repeat(250)}@x.com`)?.code).toBe("EMAIL_TOO_LONG");
    });
    it("accepts a valid email", () => {
      expect(checkEmail("lucia@hockey.com")).toBeNull();
    });
  });

  describe("password", () => {
    it.each([
      ["Ab1!", "PASSWORD_TOO_SHORT"],
      ["alllower1!", "PASSWORD_NEEDS_UPPERCASE"],
      ["ALLUPPER1!", "PASSWORD_NEEDS_LOWERCASE"],
      ["NoNumber!!", "PASSWORD_NEEDS_NUMBER"],
      ["NoSymbol123", "PASSWORD_NEEDS_SYMBOL"],
      [`Aa1!${"x".repeat(69)}`, "PASSWORD_TOO_LONG"],
      ["", "PASSWORD_REQUIRED"],
    ])("rejects %p with %s", (pw, code) => {
      expect(checkPassword(pw)?.code).toBe(code);
    });
    it("counts bytes, not characters, for the 72 limit", () => {
      expect(checkPassword(`Aa1!${"ñ".repeat(35)}`)?.code).toBe("PASSWORD_TOO_LONG");
    });
    it("rejects common passwords that satisfy the character rules", () => {
      expect(checkPassword("Password1!")?.code).toBe("PASSWORD_TOO_COMMON");
      expect(checkPassword("P@ssw0rd")?.code).toBe("PASSWORD_TOO_COMMON");
    });
    it("accepts a strong password", () => {
      expect(checkPassword("Str0ng!Passw0rd")).toBeNull();
    });
  });

  describe("username", () => {
    it("normalizes blank to undefined and lowercases", () => {
      expect(normalizeUsername("  ")).toBeUndefined();
      expect(normalizeUsername("Puck_King")).toBe("puck_king");
    });
    it("undefined is allowed (optional)", () => {
      expect(checkUsername(undefined)).toBeNull();
    });
    it.each(["ab", "has space", "bad-char", "x".repeat(21)])("rejects %p", (u) => {
      expect(checkUsername(u)?.code).toBe("USERNAME_INVALID");
    });
    it("rejects reserved names", () => {
      expect(checkUsername("admin")?.code).toBe("USERNAME_RESERVED");
    });
  });

  describe("validateRegisterCredentials", () => {
    it("returns normalized values", () => {
      expect(
        validateRegisterCredentials({
          email: " A@B.com ",
          name: " Ana ",
          username: "Ana_9",
          password: "Str0ng!Passw0rd",
        }),
      ).toEqual({
        email: "a@b.com",
        name: "Ana",
        username: "ana_9",
        password: "Str0ng!Passw0rd",
      });
    });
    it("collects one error per failing field", () => {
      try {
        validateRegisterCredentials({ email: "bad", name: "", username: "x", password: "weak" });
        fail("should throw");
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe("VALIDATION_ERROR");
        expect((e as AppError).fields?.map((f) => f.field).sort()).toEqual([
          "email",
          "name",
          "password",
          "username",
        ]);
      }
    });
  });
});
