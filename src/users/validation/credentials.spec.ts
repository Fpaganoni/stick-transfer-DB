import { AppError } from "../../common/errors/app.error";
import {
  checkDateOfBirth,
  checkEmail,
  checkPassword,
  checkRegisterCredentials,
  checkUsername,
  MAX_AGE,
  MIN_AGE,
  normalizeEmail,
  normalizeUsername,
  resolvePosition,
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

  describe("dateOfBirth", () => {
    // Frozen clock: "today" is 2026-10-09 (UTC).
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-09T12:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("exposes the age limits", () => {
      expect(MIN_AGE).toBe(16);
      expect(MAX_AGE).toBe(100);
    });
    it("undefined and null are allowed (optional)", () => {
      expect(checkDateOfBirth(undefined)).toBeNull();
      expect(checkDateOfBirth(null as unknown as undefined)).toBeNull();
    });
    it("accepts a valid adult date", () => {
      expect(checkDateOfBirth("1995-03-15")).toBeNull();
    });
    it("accepts exactly 16 years old today", () => {
      expect(checkDateOfBirth("2010-10-09")).toBeNull();
    });
    it("rejects 16 years old tomorrow as too young", () => {
      expect(checkDateOfBirth("2010-10-10")?.code).toBe("DATE_OF_BIRTH_TOO_YOUNG");
    });
    it("rejects 15 years old as too young", () => {
      const err = checkDateOfBirth("2011-10-09");
      expect(err).toMatchObject({ field: "dateOfBirth", code: "DATE_OF_BIRTH_TOO_YOUNG" });
    });
    it("rejects a future date as too young", () => {
      expect(checkDateOfBirth("2030-01-01")?.code).toBe("DATE_OF_BIRTH_TOO_YOUNG");
    });
    it("accepts exactly 100 years old today", () => {
      expect(checkDateOfBirth("1926-10-09")).toBeNull();
    });
    it("rejects older than 100 as too old", () => {
      expect(checkDateOfBirth("1926-10-08")?.code).toBe("DATE_OF_BIRTH_TOO_OLD");
      expect(checkDateOfBirth("1800-01-01")?.code).toBe("DATE_OF_BIRTH_TOO_OLD");
    });
    it.each(["2001-02-30", "2001-13-01", "2001-00-10", "2001-04-31", "2023-02-29"])(
      "rejects the non-existent date %p",
      (value) => {
        expect(checkDateOfBirth(value)).toMatchObject({
          field: "dateOfBirth",
          code: "DATE_OF_BIRTH_INVALID",
        });
      },
    );
    it("accepts a real leap day", () => {
      expect(checkDateOfBirth("2000-02-29")).toBeNull();
    });
    it("handles a Feb 29 today: exactly 16 passes, one day later is too young", () => {
      jest.setSystemTime(new Date("2028-02-29T12:00:00Z"));
      expect(checkDateOfBirth("2012-02-29")).toBeNull();
      expect(checkDateOfBirth("2012-03-01")?.code).toBe("DATE_OF_BIRTH_TOO_YOUNG");
    });
    it.each(["01/02/2000", "2000-1-2", "2000-01-02T00:00:00Z", " 2000-01-02", "", "abc", "20000102"])(
      "rejects the malformed value %p",
      (value) => {
        expect(checkDateOfBirth(value)?.code).toBe("DATE_OF_BIRTH_INVALID");
      },
    );
  });

  describe("position", () => {
    it.each(["goalkeeper", "defender", "midfielder", "attacker"])("PLAYER keeps %p", (p) => {
      expect(resolvePosition("PLAYER", p)).toEqual({ position: p, error: null });
    });
    it.each(["Forward", "Goalkeeper", "Portero", "", "striker"])("PLAYER rejects %p", (p) => {
      expect(resolvePosition("PLAYER", p).error).toMatchObject({
        field: "position",
        code: "POSITION_INVALID",
      });
    });
    it("PLAYER keeps undefined (untouched) and null (cleared)", () => {
      expect(resolvePosition("PLAYER", undefined)).toEqual({ position: undefined, error: null });
      expect(resolvePosition("PLAYER", null)).toEqual({ position: null, error: null });
    });
    it.each(["COACH", "CLUB", "UMPIRE", "SUPERADMIN"])(
      "%s ignores a provided position and stores null",
      (role) => {
        expect(resolvePosition(role, "goalkeeper")).toEqual({ position: null, error: null });
        expect(resolvePosition(role, "not-a-position")).toEqual({ position: null, error: null });
      },
    );
    it("non-PLAYER without position leaves it untouched", () => {
      expect(resolvePosition("COACH", undefined)).toEqual({ position: undefined, error: null });
    });
  });

  describe("checkRegisterCredentials", () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date("2026-10-09T12:00:00Z"));
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it("reports credential and dateOfBirth errors together", () => {
      const { errors } = checkRegisterCredentials({
        email: "bad",
        name: "Ana",
        password: "Str0ng!Passw0rd",
        dateOfBirth: "1800-01-01",
      });
      expect(errors.map((e) => e.code).sort()).toEqual(["DATE_OF_BIRTH_TOO_OLD", "EMAIL_INVALID"]);
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
