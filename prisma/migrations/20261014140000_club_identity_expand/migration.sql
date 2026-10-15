-- Club identity, step 1 of 2 (EXPAND). A club account IS the club: the identity
-- (name, crest, cover, bio, city, country) moves from "Club" to the owner "User".
-- This step only ADDS and COPIES; nothing is dropped, so it is reversible from
-- the backup table below. Step 2 (20261014140100_club_identity_contract) drops
-- the old Club columns once the new code is deployed and verified.
--
-- Rollback before step 2: see DB_info.md, "Migracion de identidad".
-- DEPLOY: apply both steps in ONE maintenance window with the new code (see DB_info.md).

-- Fail fast instead of queueing behind a long transaction (a queued ACCESS EXCLUSIVE blocks every reader).
SET LOCAL lock_timeout = '5s';

-- Same algorithm as normalizeClubNameKey() in src/clubs/club-name.ts:
-- NFKC, NFD, strip combining marks U+0300-U+036F, lowercase, collapse whitespace
-- (+ NBSP), trim. IMMUTABLE so it can back a trigger and an index.
CREATE FUNCTION club_name_key(name text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $fn$
  SELECT btrim(
    regexp_replace(
      lower(regexp_replace(normalize(normalize(name, NFKC), NFD), '[\u0300-\u036f]', '', 'g')),
      '[\s\u00a0]+', ' ', 'g'
    )
  )
$fn$;

-- Preflight: abort with a readable message instead of corrupting data.
-- Resolve by hand (merge, rename, delete) and re-run the migration.
DO $$
DECLARE
  detail text;
BEGIN
  SELECT string_agg(u."id", ', ') INTO detail
  FROM "User" u LEFT JOIN "Club" c ON c."id" = u."id"
  WHERE u."role" = 'CLUB' AND c."id" IS NULL;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'CLUB users without a Club row (no club name to copy): %', detail;
  END IF;

  SELECT string_agg(c."id", ', ') INTO detail
  FROM "Club" c JOIN "User" u ON u."id" = c."id"
  WHERE u."role" <> 'CLUB';
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'Club rows whose owner user is not role CLUB (fix the role or delete the club): %', detail;
  END IF;

  SELECT string_agg(c."id" || '=' || c."country", ', ') INTO detail
  FROM "Club" c
  WHERE c."country" !~ '^[A-Z]{2}(-[A-Z]{3})?$';
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'Club.country is not a normalized country code: %', detail;
  END IF;

  SELECT string_agg(c."id", ', ') INTO detail
  FROM "Club" c WHERE club_name_key(c."name") = '' OR regexp_replace(c."city", '[\s\u00a0]+', '', 'g') = '';
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'Clubs with a blank name or city: %', detail;
  END IF;

  SELECT string_agg(k.key || ' [' || k.ids || ']', '; ') INTO detail
  FROM (
    SELECT club_name_key("name") AS key, string_agg("id", ', ') AS ids
    FROM "Club" GROUP BY club_name_key("name") HAVING count(*) > 1
  ) k;
  IF detail IS NOT NULL THEN
    RAISE EXCEPTION 'Club names that collide once case, accents and spaces are ignored: %', detail;
  END IF;
END $$;

-- Backup of every value this migration overwrites or drops. Separate schema so
-- Prisma (which only introspects "public") never proposes dropping it.
CREATE SCHEMA IF NOT EXISTS backup;
-- "prisma migrate reset" only recreates schema public, so a previous run's backup is still
-- here on the next reset. A failed run rolls back completely, so nothing real is lost.
DROP TABLE IF EXISTS backup.club_identity_20261014;
CREATE TABLE backup.club_identity_20261014 AS
SELECT
  c."id",
  c."name"               AS club_name,
  c."logo"               AS club_logo,
  c."coverImage"         AS club_cover_image,
  c."coverImagePosition" AS club_cover_position,
  c."bio"                AS club_bio,
  c."city"               AS club_city,
  c."country"            AS club_country,
  c."videos"             AS club_videos,
  u."name"               AS user_name,
  u."avatar"             AS user_avatar,
  u."coverImage"         AS user_cover_image,
  u."coverImagePosition" AS user_cover_position,
  u."bio"                AS user_bio,
  u."city"               AS user_city,
  u."country"            AS user_country,
  u."dateOfBirth"        AS user_date_of_birth,
  u."level"              AS user_level,
  u."yearsOfExperience"  AS user_years_of_experience,
  u."clubId"             AS user_club_id,
  u."cvUrl"              AS user_cv_url,
  u."multimedia"         AS user_multimedia
FROM "Club" c JOIN "User" u ON u."id" = c."id";

-- The backup holds personal data of club administrators: lock it down.
REVOKE ALL ON SCHEMA backup FROM PUBLIC;
REVOKE ALL ON TABLE backup.club_identity_20261014 FROM PUBLIC;
ALTER TABLE backup.club_identity_20261014 ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA backup FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE backup.club_identity_20261014 FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA backup FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE backup.club_identity_20261014 FROM authenticated';
  END IF;
END $$;

-- The key column is filled ONLY by this trigger (role CLUB -> key, else NULL),
-- so role changes and every writer stay consistent without app code.
ALTER TABLE "User" ADD COLUMN "clubNameKey" TEXT;

CREATE FUNCTION user_set_club_name_key() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF NEW."role" = 'CLUB' THEN
    NEW."clubNameKey" := club_name_key(NEW."name");
  ELSE
    NEW."clubNameKey" := NULL;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER "User_club_name_key_trg"
BEFORE INSERT OR UPDATE OF "name", "role" ON "User"
FOR EACH ROW EXECUTE FUNCTION user_set_club_name_key();

-- The admin person's real name only lived in User.name, which is about to become the
-- club name. Legacy clubs have 'Sin definir' as managedBy (migration 20260929141843):
-- keep the person's name there before it is overwritten.
UPDATE "Club" c SET
  "managedByFirstName" = split_part(btrim(u."name"), ' ', 1),
  "managedByLastName"  = COALESCE(
    NULLIF(btrim(substr(btrim(u."name"), length(split_part(btrim(u."name"), ' ', 1)) + 1)), ''),
    'Sin definir'
  )
FROM "User" u
WHERE u."id" = c."id" AND u."role" = 'CLUB'
  AND c."managedByFirstName" = 'Sin definir' AND c."managedByLastName" = 'Sin definir'
  AND btrim(u."name") <> '';

-- Identity copy, CLUB users only. Club values win (the person's own photo,
-- bio and cover do not represent the club). Person-only fields are cleared:
-- a club has no date of birth, level, experience, current club, CV or gallery.
-- Clearing them also guarantees the NOT VALID checks on "User" pass for the row.
UPDATE "User" u SET
  "name"               = btrim(regexp_replace(c."name", '[\s\u00a0]+', ' ', 'g')),
  "avatar"             = c."logo",
  "coverImage"         = c."coverImage",
  "coverImagePosition" = c."coverImagePosition",
  "bio"                = c."bio",
  "city"               = btrim(c."city"),
  "country"            = c."country",
  "dateOfBirth"        = NULL,
  "level"              = NULL,
  "yearsOfExperience"  = NULL,
  "clubId"             = NULL,
  "cvUrl"              = NULL,
  "multimedia"         = ARRAY[]::TEXT[]
FROM "Club" c
WHERE c."id" = u."id" AND u."role" = 'CLUB';

CREATE UNIQUE INDEX "User_clubNameKey_key" ON "User"("clubNameKey");

-- Club.city / Club.country are NOT NULL in the API, so a CLUB user must keep both.
ALTER TABLE "User" ADD CONSTRAINT "User_club_location_check"
  CHECK ("role" <> 'CLUB' OR ("city" IS NOT NULL AND "country" IS NOT NULL));

-- getClubAdmins sorts CLUB users by name.
CREATE INDEX "User_role_name_idx" ON "User"("role", "name");
