-- Club identity, step 2 of 2 (CONTRACT). Run after step 1 and after the code
-- that reads the identity from "User" is deployed and verified. The old values
-- stay recoverable from backup.club_identity_20261014 (created in step 1).

SET LOCAL lock_timeout = '5s';

DROP INDEX "Club_name_key";
DROP INDEX "Club_name_idx";
DROP INDEX "Club_country_city_idx";

ALTER TABLE "Club" DROP CONSTRAINT "Club_country_format_check";

ALTER TABLE "Club"
  DROP COLUMN "name",
  DROP COLUMN "logo",
  DROP COLUMN "coverImage",
  DROP COLUMN "coverImagePosition",
  DROP COLUMN "bio",
  DROP COLUMN "city",
  DROP COLUMN "country",
  DROP COLUMN "videos";
