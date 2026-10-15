import { FieldError } from "../../common/errors/app.error";

/**
 * Person and umpire fields live on `User` because PLAYER, COACH and UMPIRE use
 * them, but a CLUB account is the club, not a person: it never has any of them.
 * The DB CHECK `User_club_no_person_fields_check` backs this list up; keep both
 * in sync. Declaration order is the order errors are reported in.
 */
export const CLUB_FORBIDDEN_PERSON_FIELDS = [
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
] as const;

export type ClubForbiddenPersonField = (typeof CLUB_FORBIDDEN_PERSON_FIELDS)[number];

/**
 * One FIELD_NOT_ALLOWED error per forbidden field that was sent. `undefined`
 * means "not sent"; anything else, `null` included, is rejected (a club has
 * nothing to clear). Judge by the STORED role, not the caller's.
 */
export function checkClubForbiddenFields(
  values: Partial<Record<ClubForbiddenPersonField, unknown>>,
): FieldError[] {
  return CLUB_FORBIDDEN_PERSON_FIELDS.filter((field) => values[field] !== undefined).map(
    (field) => ({
      field,
      code: "FIELD_NOT_ALLOWED",
      message: `A club account cannot have ${field}`,
    }),
  );
}
