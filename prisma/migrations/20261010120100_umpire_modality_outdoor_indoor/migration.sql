-- UmpireModality: CESPED | SALA | INDOOR  ->  OUTDOOR | INDOOR
-- Used by User.modalities (UmpireModality[]) and JobOpportunity.modality.
-- Mapping: CESPED -> OUTDOOR; SALA and INDOOR -> INDOOR (arrays without duplicates).
--
-- Postgres cannot drop values from an enum, and ALTER COLUMN ... TYPE ... USING
-- does not allow subqueries (needed to dedupe the array), so: new type +
-- temporary columns, copy with the mapping, drop old columns and type, rename.
-- Neither column has an index or a default, so there is nothing to recreate.
-- Prisma applies the whole file in one transaction.

CREATE TYPE "UmpireModality_new" AS ENUM ('OUTDOOR', 'INDOOR');

ALTER TABLE "User" ADD COLUMN "modalities_new" "UmpireModality_new"[];
ALTER TABLE "JobOpportunity" ADD COLUMN "modality_new" "UmpireModality_new";

-- NULL stays NULL, '{}' stays '{}'
UPDATE "User" SET "modalities_new" = (
  SELECT COALESCE(array_agg(DISTINCT mapped ORDER BY mapped), '{}')
  FROM (
    SELECT (CASE m::text WHEN 'CESPED' THEN 'OUTDOOR' ELSE 'INDOOR' END)::"UmpireModality_new" AS mapped
    FROM unnest("modalities") AS m
  ) AS mapped_values
)
WHERE "modalities" IS NOT NULL;

UPDATE "JobOpportunity"
SET "modality_new" = (CASE "modality"::text WHEN 'CESPED' THEN 'OUTDOOR' ELSE 'INDOOR' END)::"UmpireModality_new"
WHERE "modality" IS NOT NULL;

ALTER TABLE "User" DROP COLUMN "modalities";
ALTER TABLE "JobOpportunity" DROP COLUMN "modality";
DROP TYPE "UmpireModality";

ALTER TYPE "UmpireModality_new" RENAME TO "UmpireModality";
ALTER TABLE "User" RENAME COLUMN "modalities_new" TO "modalities";
ALTER TABLE "JobOpportunity" RENAME COLUMN "modality_new" TO "modality";
