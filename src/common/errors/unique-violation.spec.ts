import { BadRequestException } from "@nestjs/common";
import { AppError } from "./app.error";
import { mapUniqueViolation } from "./unique-violation";

describe("mapUniqueViolation", () => {
  const p2002 = (target: unknown) => ({ code: "P2002", meta: { target } });

  it("returns null for errors that are not unique violations", () => {
    expect(mapUniqueViolation(new Error("boom"))).toBeNull();
    expect(mapUniqueViolation({ code: "P2025" })).toBeNull();
    expect(mapUniqueViolation(undefined)).toBeNull();
  });

  it("maps the clubNameKey column target to CLUB_NAME_TAKEN (409, field name)", () => {
    const mapped = mapUniqueViolation(p2002(["clubNameKey"])) as AppError;

    expect(mapped).toBeInstanceOf(AppError);
    expect(mapped.code).toBe("CLUB_NAME_TAKEN");
    expect(mapped.getStatus()).toBe(409);
    expect(mapped.field).toBe("name");
  });

  it("maps the constraint name User_clubNameKey_key to CLUB_NAME_TAKEN", () => {
    const mapped = mapUniqueViolation(p2002("User_clubNameKey_key")) as AppError;

    expect(mapped.code).toBe("CLUB_NAME_TAKEN");
    expect(mapped.field).toBe("name");
  });

  it("reports the field the caller asks for (clubName in register)", () => {
    const fromColumns = mapUniqueViolation(p2002(["clubNameKey"]), {
      clubNameField: "clubName",
    }) as AppError;
    const fromConstraint = mapUniqueViolation(p2002("User_clubNameKey_key"), {
      clubNameField: "clubName",
    }) as AppError;

    expect(fromColumns.field).toBe("clubName");
    expect(fromConstraint.field).toBe("clubName");
  });

  it("still maps email and username targets", () => {
    expect((mapUniqueViolation(p2002(["email"])) as AppError).code).toBe("EMAIL_TAKEN");
    expect((mapUniqueViolation(p2002("User_username_key")) as AppError).code).toBe(
      "USERNAME_TAKEN",
    );
  });

  it("falls back to a generic 400 for any other unique target or a missing target", () => {
    expect(mapUniqueViolation(p2002(["slug"]))).toBeInstanceOf(BadRequestException);
    expect(mapUniqueViolation({ code: "P2002" })).toBeInstanceOf(BadRequestException);
  });
});
