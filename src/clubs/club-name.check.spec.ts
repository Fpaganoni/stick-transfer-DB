import { checkClubName } from "./club-name";

describe("checkClubName", () => {
  it("returns the trimmed, space-collapsed display name", () => {
    expect(checkClubName("  Club   de  Campo ", "name")).toEqual({ name: "Club de Campo" });
  });

  it.each([
    ["", "NAME_REQUIRED"],
    ["   ", "NAME_REQUIRED"],
    ["x".repeat(101), "NAME_TOO_LONG"],
    ["Club\u0000Uno", "NAME_INVALID"],
    ["Club​Uno", "NAME_INVALID"],
    ["Club‮Uno", "NAME_INVALID"],
  ])("rejects %j with %s", (raw, code) => {
    expect(checkClubName(raw, "name")).toEqual({
      error: expect.objectContaining({ field: "name", code }),
    });
  });

  it("reports the error under the requested field", () => {
    expect(checkClubName("", "clubName").error).toMatchObject({ field: "clubName" });
    expect(checkClubName("Club​Uno", "clubName").error).toMatchObject({ field: "clubName" });
  });

  it("accepts a name of exactly 100 chars", () => {
    expect(checkClubName("x".repeat(100), "name").error).toBeUndefined();
  });

  it("treats a non-breaking space as a plain space", () => {
    expect(checkClubName("Club Uno", "name")).toEqual({ name: "Club Uno" });
  });
});
