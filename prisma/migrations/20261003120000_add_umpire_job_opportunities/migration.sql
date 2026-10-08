-- AlterEnum
ALTER TYPE "PositionType" ADD VALUE 'UMPIRE';

-- AlterTable
ALTER TABLE "JobOpportunity" ADD COLUMN     "licenseLevelRequired" "UmpireLicenseLevel",
ADD COLUMN     "matchDate" TIMESTAMP(3),
ADD COLUMN     "modality" "UmpireModality",
ADD COLUMN     "umpireCategory" "UmpireCategory";

-- CreateIndex
CREATE INDEX "JobOpportunity_matchDate_idx" ON "JobOpportunity"("matchDate");
