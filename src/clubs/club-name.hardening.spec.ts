import { AppError } from "../common/errors/app.error";
import { hasControlOrFormatChars, normalizeClubNameKey } from "./club-name";
import { ClubsService, checkManagerName } from "./clubs.service";

describe("normalizeClubNameKey - compatibility forms", () => {
  it("treats fullwidth letters as their plain counterparts", () => {
    expect(normalizeClubNameKey("Ｒeal Madrid")).toBe(normalizeClubNameKey("Real Madrid"));
  });

  it("treats circled digits and ligatures as plain characters", () => {
    expect(normalizeClubNameKey("① Club")).toBe("1 club");
    expect(normalizeClubNameKey("Oﬃce HC")).toBe("office hc");
  });
});

describe("hasControlOrFormatChars", () => {
  it.each([
    ["zero-width space", "Real​Madrid"],
    ["byte order mark", "﻿Real Madrid"],
    ["soft hyphen", "Real­Madrid"],
    ["right-to-left override", "Real ‮Madrid"],
    ["tab", "Real\tMadrid"],
    ["newline", "Real\nMadrid"],
    ["NUL", "Real\u0000Madrid"],
  ])("flags %s", (_label, value) => {
    expect(hasControlOrFormatChars(value)).toBe(true);
  });

  it.each(["Real Madrid", "Atlètic Terrassa HC", "Ørsted ÉCOLE", "Club 1902", "C.D. Núñez-Ríos"])(
    "accepts the visible name %s",
    (value) => {
      expect(hasControlOrFormatChars(value)).toBe(false);
    },
  );
});

describe("checkManagerName", () => {
  it("requires a non-blank value", () => {
    expect(checkManagerName("managedByFirstName", "   ")?.code).toBe("FIELD_REQUIRED");
  });

  it("caps the length at 100 characters", () => {
    expect(checkManagerName("managedByLastName", "x".repeat(101))?.code).toBe("NAME_TOO_LONG");
    expect(checkManagerName("managedByLastName", "x".repeat(100))).toBeNull();
  });

  it("rejects control and invisible characters, reporting the given field", () => {
    expect(checkManagerName("managedByFirstName", "Ana​")).toMatchObject({
      field: "managedByFirstName",
      code: "NAME_INVALID",
    });
  });

  it("accepts an ordinary name", () => {
    expect(checkManagerName("managedByFirstName", "María José")).toBeNull();
  });
});

describe("ClubsService.assertClubIdentityUpdate - invisible characters", () => {
  const prisma = { user: { findFirst: jest.fn() } };
  const service = new ClubsService(prisma as any, { emit: jest.fn() } as any);

  beforeEach(() => {
    prisma.user.findFirst.mockReset();
  });

  it("rejects a name with a zero-width space before looking for a duplicate", async () => {
    const error = await service
      .assertClubIdentityUpdate("club-1", { name: "Real​Madrid" })
      .catch((e) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error.fields).toEqual([expect.objectContaining({ field: "name", code: "NAME_INVALID" })]);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("looks up the compatibility-normalized key, so a fullwidth lookalike collides", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "other-club" });

    await expect(
      service.assertClubIdentityUpdate("club-1", { name: "Ｒeal Madrid" }),
    ).rejects.toMatchObject({ code: "CLUB_NAME_TAKEN" });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { clubNameKey: "real madrid", NOT: { id: "club-1" } },
      select: { id: true },
    });
  });
});
