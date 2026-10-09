-- UMPIRE profiles have no multimedia.
--
-- Data: UMPIRE users that still have multimedia are deleted (mock data, decided
-- on 2026-10-10). Every FK to "User" is ON DELETE CASCADE or SET NULL, so their
-- certifications, trajectories, messages, follows, likes, etc. go with them.
DELETE FROM "User"
WHERE "role" = 'UMPIRE' AND "multimedia" IS NOT NULL AND cardinality("multimedia") > 0;

-- Guard. Fully validated: the DELETE above leaves no violating row, and role is
-- only set on creation. updateUser rejects multimedia for UMPIRE with
-- VALIDATION_ERROR (FIELD_NOT_ALLOWED) before this could fire.
ALTER TABLE "User" ADD CONSTRAINT "User_umpire_no_multimedia_check"
  CHECK ("role" <> 'UMPIRE' OR "multimedia" IS NULL OR cardinality("multimedia") = 0);
