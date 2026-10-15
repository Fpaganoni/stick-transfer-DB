-- One social axis per club + no person fields on CLUB accounts.
--
-- A CLUB account is followed, follows and is reported ONLY on the CLUB axis
-- (FollowEntityType / ReportTargetType = CLUB, same id as the User). Rows that
-- still use the USER axis for a CLUB account are moved to CLUB; when the CLUB
-- twin already exists the USER row is deleted (the CLUB row wins). A row that
-- would become a self-follow once normalized is deleted too (it would violate
-- Follow_no_self_follow_check). Likes no longer exist (20261014130000_drop_likes).
--
-- A CLUB account is not a person: its person/umpire columns are set to NULL/{}
-- and its trajectories and umpire certifications are deleted, then guarded by
-- User_club_no_person_fields_check.
--
-- Everything this migration changes or deletes is kept in backup.* tables (same
-- lockdown as backup.club_identity_20261014). The follow and report backups have
-- an "action" column: MOVE | DELETE_DUPLICATE | DELETE_SELF (follow only).
-- prisma/scripts/club-single-axis-counts.ts shows the numbers BEFORE running it.

-- Precondition: the typed FK Follow.followingClubId -> Club needs a Club row for
-- every CLUB account. Fail loudly instead of half-migrating.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(u."id", ', ') INTO missing
  FROM "User" u LEFT JOIN "Club" c ON c."id" = u."id"
  WHERE u."role" = 'CLUB' AND c."id" IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'CLUB accounts without a Club row: %', missing;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS backup;

-- Freeze writers between the plan (step 1) and the apply (steps 2-3): a USER-axis row
-- inserted by a still-running old build would otherwise abort the verification at the end.
-- Reads are not blocked. Deploy the new app build together with this migration.
LOCK TABLE "Follow", "Report" IN SHARE ROW EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1. Plan + backup (enum columns are stored as text so backup.* never blocks
--    a later enum change). A previous run's tables survive "migrate reset".
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS backup.club_axis_follow_20261015;
CREATE TABLE backup.club_axis_follow_20261015 AS
WITH clubs AS (SELECT "id" FROM "User" WHERE "role" = 'CLUB'),
calc AS (
  SELECT
    f."id", f."followerId", f."followerType"::text AS "followerType",
    f."followingId", f."followingType"::text AS "followingType",
    f."followingUserId", f."followingClubId", f."createdAt",
    CASE WHEN f."followerType" = 'USER' AND f."followerId" IN (SELECT "id" FROM clubs)
         THEN 'CLUB' ELSE f."followerType"::text END AS "newFollowerType",
    CASE WHEN f."followingType" = 'USER' AND f."followingId" IN (SELECT "id" FROM clubs)
         THEN 'CLUB' ELSE f."followingType"::text END AS "newFollowingType"
  FROM "Follow" f
),
ranked AS (
  SELECT calc.*,
    row_number() OVER (
      PARTITION BY "followerId", "newFollowerType", "followingId", "newFollowingType"
      -- a row already in its final form always wins over one that has to move
      ORDER BY ("followerType" = "newFollowerType" AND "followingType" = "newFollowingType") DESC,
               "createdAt", "id"
    ) AS rn
  FROM calc
)
SELECT
  "id", "followerId", "followerType", "followingId", "followingType",
  "followingUserId", "followingClubId", "createdAt", "newFollowerType", "newFollowingType",
  CASE
    WHEN "newFollowerType" = "newFollowingType" AND "followerId" = "followingId" THEN 'DELETE_SELF'
    WHEN rn > 1 THEN 'DELETE_DUPLICATE'
    ELSE 'MOVE'
  END AS "action"
FROM ranked
WHERE "followerType" <> "newFollowerType" OR "followingType" <> "newFollowingType" OR rn > 1;

DROP TABLE IF EXISTS backup.club_axis_report_20261015;
CREATE TABLE backup.club_axis_report_20261015 AS
SELECT
  r."id", r."reporterId", r."targetType"::text AS "targetType", r."targetId",
  r."reason"::text AS "reason", r."description", r."status"::text AS "status",
  r."reviewedById", r."reviewedAt", r."createdAt", r."updatedAt",
  CASE WHEN EXISTS (
    SELECT 1 FROM "Report" c
    WHERE c."reporterId" = r."reporterId" AND c."targetType" = 'CLUB' AND c."targetId" = r."targetId"
  ) THEN 'DELETE_DUPLICATE' ELSE 'MOVE' END AS "action"
FROM "Report" r
WHERE r."targetType" = 'USER'
  AND r."targetId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB');

DROP TABLE IF EXISTS backup.club_person_fields_20261015;
CREATE TABLE backup.club_person_fields_20261015 AS
SELECT
  "id", "dateOfBirth", "cvUrl", "position", "yearsOfExperience", "level"::text AS "level",
  "licenseLevel"::text AS "licenseLevel", "certifyingBody", "licenseNumber", "certificationYear",
  "matchesOfficiated", "travelAvailability"::text AS "travelAvailability",
  "languages", "modalities"::text[] AS "modalities", "umpireCategories"::text[] AS "umpireCategories",
  "multimedia"
FROM "User"
WHERE "role" = 'CLUB' AND (
  "dateOfBirth" IS NOT NULL OR "cvUrl" IS NOT NULL OR "position" IS NOT NULL
  OR "yearsOfExperience" IS NOT NULL OR "level" IS NOT NULL OR "licenseLevel" IS NOT NULL
  OR "certifyingBody" IS NOT NULL OR "licenseNumber" IS NOT NULL OR "certificationYear" IS NOT NULL
  OR "matchesOfficiated" IS NOT NULL OR "travelAvailability" IS NOT NULL
  OR coalesce(cardinality("multimedia"), 0) > 0 OR coalesce(cardinality("languages"), 0) > 0
  OR coalesce(cardinality("modalities"), 0) > 0 OR coalesce(cardinality("umpireCategories"), 0) > 0
);

DROP TABLE IF EXISTS backup.club_trajectories_20261015;
CREATE TABLE backup.club_trajectories_20261015 AS
SELECT t.* FROM "Trajectory" t JOIN "User" u ON u."id" = t."userId" WHERE u."role" = 'CLUB';

DROP TABLE IF EXISTS backup.club_umpire_certifications_20261015;
CREATE TABLE backup.club_umpire_certifications_20261015 AS
SELECT c.* FROM "UmpireCertification" c JOIN "User" u ON u."id" = c."userId" WHERE u."role" = 'CLUB';

-- The backups hold personal data: lock them down like the identity backup.
REVOKE ALL ON SCHEMA backup FROM PUBLIC;
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'club_axis_follow_20261015', 'club_axis_report_20261015', 'club_person_fields_20261015',
    'club_trajectories_20261015', 'club_umpire_certifications_20261015'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE backup.%I FROM PUBLIC', tbl);
    EXECUTE format('ALTER TABLE backup.%I ENABLE ROW LEVEL SECURITY', tbl);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE backup.%I FROM anon', tbl);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE backup.%I FROM authenticated', tbl);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA backup FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA backup FROM authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Follow: delete duplicates and would-be self-follows, then move the rest.
--    Moves only go from a non-final tuple to a final one and final tuples are
--    never moved, so the unique index cannot clash mid-statement.
-- ---------------------------------------------------------------------------
DELETE FROM "Follow" f
USING backup.club_axis_follow_20261015 p
WHERE f."id" = p."id" AND p."action" IN ('DELETE_SELF', 'DELETE_DUPLICATE');

UPDATE "Follow" f SET
  "followerType"    = p."newFollowerType"::"FollowEntityType",
  "followingType"   = p."newFollowingType"::"FollowEntityType",
  "followingUserId" = CASE WHEN p."newFollowingType" = 'USER' THEN f."followingId" ELSE NULL END,
  "followingClubId" = CASE WHEN p."newFollowingType" = 'CLUB' THEN f."followingId" ELSE NULL END
FROM backup.club_axis_follow_20261015 p
WHERE f."id" = p."id" AND p."action" = 'MOVE';

-- ---------------------------------------------------------------------------
-- 3. Report: the CLUB twin wins; otherwise the report moves to the CLUB axis.
-- ---------------------------------------------------------------------------
DELETE FROM "Report" r
USING backup.club_axis_report_20261015 p
WHERE r."id" = p."id" AND p."action" = 'DELETE_DUPLICATE';

UPDATE "Report" r SET "targetType" = 'CLUB'
FROM backup.club_axis_report_20261015 p
WHERE r."id" = p."id" AND p."action" = 'MOVE';

-- ---------------------------------------------------------------------------
-- 4. CLUB accounts have no person data.
-- ---------------------------------------------------------------------------
DELETE FROM "Trajectory" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB');
DELETE FROM "UmpireCertification" WHERE "userId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB');

UPDATE "User" SET
  "dateOfBirth" = NULL, "cvUrl" = NULL, "position" = NULL, "yearsOfExperience" = NULL,
  "level" = NULL, "licenseLevel" = NULL, "certifyingBody" = NULL, "licenseNumber" = NULL,
  "certificationYear" = NULL, "matchesOfficiated" = NULL, "travelAvailability" = NULL,
  "multimedia" = '{}', "languages" = '{}', "modalities" = '{}', "umpireCategories" = '{}'
WHERE "id" IN (SELECT "id" FROM backup.club_person_fields_20261015);

-- Guard, fully validated (the UPDATE above leaves no violating row). Role is only
-- set on creation; updateUser/register reject these fields for a CLUB with
-- VALIDATION_ERROR (FIELD_NOT_ALLOWED) before this could fire. Keep the list in
-- sync with CLUB_FORBIDDEN_PERSON_FIELDS (src/users/validation/club-person-fields.ts).
ALTER TABLE "User" ADD CONSTRAINT "User_club_no_person_fields_check" CHECK (
  "role" <> 'CLUB' OR (
    "dateOfBirth" IS NULL AND "cvUrl" IS NULL AND "position" IS NULL
    AND "yearsOfExperience" IS NULL AND "level" IS NULL AND "licenseLevel" IS NULL
    AND "certifyingBody" IS NULL AND "licenseNumber" IS NULL AND "certificationYear" IS NULL
    AND "matchesOfficiated" IS NULL AND "travelAvailability" IS NULL
    AND coalesce(cardinality("multimedia"), 0) = 0 AND coalesce(cardinality("languages"), 0) = 0
    AND coalesce(cardinality("modalities"), 0) = 0 AND coalesce(cardinality("umpireCategories"), 0) = 0
  )
);

-- ---------------------------------------------------------------------------
-- 5. Verify: nothing may be left on the USER axis for a CLUB account.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  leftover bigint;
  moved bigint;
  dup bigint;
  self bigint;
BEGIN
  SELECT count(*) INTO leftover FROM "Follow" f
  WHERE (f."followingType" = 'USER' AND f."followingId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB'))
     OR (f."followerType" = 'USER' AND f."followerId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB'));
  IF leftover > 0 THEN
    RAISE EXCEPTION 'Follow rows still on the USER axis of a CLUB account: %', leftover;
  END IF;

  SELECT count(*) INTO leftover FROM "Report" r
  WHERE r."targetType" = 'USER' AND r."targetId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB');
  IF leftover > 0 THEN
    RAISE EXCEPTION 'Report rows still on the USER axis of a CLUB account: %', leftover;
  END IF;

  SELECT count(*) FILTER (WHERE "action" = 'MOVE'),
         count(*) FILTER (WHERE "action" = 'DELETE_DUPLICATE'),
         count(*) FILTER (WHERE "action" = 'DELETE_SELF')
  INTO moved, dup, self FROM backup.club_axis_follow_20261015;
  RAISE NOTICE 'Follow: % moved to CLUB, % duplicates deleted, % self-follows deleted', moved, dup, self;

  SELECT count(*) FILTER (WHERE "action" = 'MOVE'),
         count(*) FILTER (WHERE "action" = 'DELETE_DUPLICATE')
  INTO moved, dup FROM backup.club_axis_report_20261015;
  RAISE NOTICE 'Report: % moved to CLUB, % duplicates deleted', moved, dup;

  SELECT count(*) INTO moved FROM backup.club_person_fields_20261015;
  RAISE NOTICE 'CLUB accounts cleaned of person fields: %', moved;
END $$;
