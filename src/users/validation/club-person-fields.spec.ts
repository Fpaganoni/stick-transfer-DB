import {
  CLUB_FORBIDDEN_PERSON_FIELDS,
  checkClubForbiddenFields,
} from "./club-person-fields";

describe("club person fields", () => {
  it("lists every person and umpire field a CLUB account cannot have", () => {
    expect([...CLUB_FORBIDDEN_PERSON_FIELDS].sort()).toEqual(
      [
        "dateOfBirth",
        "cvUrl",
        "position",
        "yearsOfExperience",
        "level",
        "trajectories",
        "multimedia",
        "licenseLevel",
        "certifyingBody",
        "licenseNumber",
        "certificationYear",
        "matchesOfficiated",
        "travelAvailability",
        "languages",
        "modalities",
        "umpireCategories",
        "umpireCertifications",
      ].sort(),
    );
  });

  it.each(CLUB_FORBIDDEN_PERSON_FIELDS)("flags %s with FIELD_NOT_ALLOWED", (field) => {
    const errors = checkClubForbiddenFields({ [field]: "anything" });

    expect(errors).toEqual([expect.objectContaining({ field, code: "FIELD_NOT_ALLOWED" })]);
  });

  it.each([null, "", [], 0, false])("flags a provided empty-ish value %p too", (value) => {
    expect(checkClubForbiddenFields({ multimedia: value })).toHaveLength(1);
  });

  it("ignores fields that are undefined (not sent)", () => {
    expect(checkClubForbiddenFields({ dateOfBirth: undefined, position: undefined })).toEqual([]);
  });

  it("ignores fields a club may edit", () => {
    expect(checkClubForbiddenFields({ name: "Club", bio: "x", city: "Madrid" } as any)).toEqual([]);
  });

  it("reports every forbidden field in one pass, in declaration order", () => {
    const errors = checkClubForbiddenFields({ position: "attacker", dateOfBirth: "2000-01-01" });

    expect(errors.map((e) => e.field)).toEqual(["dateOfBirth", "position"]);
  });
});
