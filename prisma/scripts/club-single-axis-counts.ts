/**
 * READ-ONLY. Shows what migration 20261015120000_club_single_social_axis would
 * change, so the numbers can be reviewed BEFORE running it. Writes nothing.
 *
 *   pnpm ts-node prisma/scripts/club-single-axis-counts.ts
 *
 * The follow plan mirrors the migration's plan query: keep both in sync.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type CountRow = { label: string; count: bigint };

const FOLLOW_PLAN = `
  WITH clubs AS (SELECT "id" FROM "User" WHERE "role" = 'CLUB'),
  calc AS (
    SELECT f."id", f."followerId", f."followingId", f."createdAt",
      f."followerType"::text AS "followerType", f."followingType"::text AS "followingType",
      CASE WHEN f."followerType" = 'USER' AND f."followerId" IN (SELECT "id" FROM clubs)
           THEN 'CLUB' ELSE f."followerType"::text END AS "newFollowerType",
      CASE WHEN f."followingType" = 'USER' AND f."followingId" IN (SELECT "id" FROM clubs)
           THEN 'CLUB' ELSE f."followingType"::text END AS "newFollowingType"
    FROM "Follow" f
  ),
  ranked AS (
    SELECT calc.*, row_number() OVER (
      PARTITION BY "followerId", "newFollowerType", "followingId", "newFollowingType"
      ORDER BY ("followerType" = "newFollowerType" AND "followingType" = "newFollowingType") DESC,
               "createdAt", "id") AS rn
    FROM calc
  )
  SELECT
    CASE
      WHEN "newFollowerType" = "newFollowingType" AND "followerId" = "followingId" THEN 'follow DELETE_SELF'
      WHEN rn > 1 THEN 'follow DELETE_DUPLICATE'
      ELSE 'follow MOVE'
    END AS label,
    count(*) AS count
  FROM ranked
  WHERE "followerType" <> "newFollowerType" OR "followingType" <> "newFollowingType" OR rn > 1
  GROUP BY 1`;

const REPORT_PLAN = `
  SELECT
    CASE WHEN EXISTS (
      SELECT 1 FROM "Report" c
      WHERE c."reporterId" = r."reporterId" AND c."targetType" = 'CLUB' AND c."targetId" = r."targetId"
    ) THEN 'report DELETE_DUPLICATE' ELSE 'report MOVE' END AS label,
    count(*) AS count
  FROM "Report" r
  WHERE r."targetType" = 'USER' AND r."targetId" IN (SELECT "id" FROM "User" WHERE "role" = 'CLUB')
  GROUP BY 1`;

const PERSON_FIELDS = `
  SELECT 'CLUB accounts with person fields to clean' AS label, count(*) AS count
  FROM "User"
  WHERE "role" = 'CLUB' AND (
    "dateOfBirth" IS NOT NULL OR "cvUrl" IS NOT NULL OR "position" IS NOT NULL
    OR "yearsOfExperience" IS NOT NULL OR "level" IS NOT NULL OR "licenseLevel" IS NOT NULL
    OR "certifyingBody" IS NOT NULL OR "licenseNumber" IS NOT NULL OR "certificationYear" IS NOT NULL
    OR "matchesOfficiated" IS NOT NULL OR "travelAvailability" IS NOT NULL
    OR coalesce(cardinality("multimedia"), 0) > 0 OR coalesce(cardinality("languages"), 0) > 0
    OR coalesce(cardinality("modalities"), 0) > 0 OR coalesce(cardinality("umpireCategories"), 0) > 0)
  UNION ALL
  SELECT 'Trajectory rows of CLUB accounts (deleted)', count(*)
  FROM "Trajectory" t JOIN "User" u ON u."id" = t."userId" WHERE u."role" = 'CLUB'
  UNION ALL
  SELECT 'UmpireCertification rows of CLUB accounts (deleted)', count(*)
  FROM "UmpireCertification" c JOIN "User" u ON u."id" = c."userId" WHERE u."role" = 'CLUB'
  UNION ALL
  SELECT 'CLUB accounts without a Club row (migration would abort)', count(*)
  FROM "User" u LEFT JOIN "Club" c ON c."id" = u."id" WHERE u."role" = 'CLUB' AND c."id" IS NULL
  UNION ALL
  SELECT 'CLUB accounts in total', count(*) FROM "User" WHERE "role" = 'CLUB'`;

async function main(): Promise<void> {
  const rows: CountRow[] = [];
  for (const query of [FOLLOW_PLAN, REPORT_PLAN, PERSON_FIELDS]) {
    rows.push(...(await prisma.$queryRawUnsafe<CountRow[]>(query)));
  }
  console.table(rows.map(({ label, count }) => ({ label, count: Number(count) })));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
