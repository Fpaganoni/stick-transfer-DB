-- Data migration: Club becomes the club-profile of its CLUB-role User (Club.id == User.id).
-- Move each Club's primary key to the id of the User that currently owns it (adminId).
-- All FKs referencing Club(id) (ClubMember, Team, JobOpportunity, User.clubId, Trajectory,
-- Follow.followingId, Like.likedId) are ON UPDATE CASCADE and will follow automatically.
UPDATE "Club" SET "id" = "adminId";

-- DropForeignKey
ALTER TABLE "Club" DROP CONSTRAINT "Club_adminId_fkey";

-- DropIndex
DROP INDEX "Club_adminId_idx";

-- DropConstraint (unique)
ALTER TABLE "Club" DROP CONSTRAINT "Club_adminId_key";

-- AlterTable
ALTER TABLE "Club" DROP COLUMN "adminId";

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'CLUB', 'POST', 'JOB_OPPORTUNITY', 'MESSAGE', 'NEWS_ARTICLE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_PROFILE', 'SCAM', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'ACTION_TAKEN', 'DISMISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'CLUB_PENDING_VERIFICATION';
ALTER TYPE "NotificationType" ADD VALUE 'CLUB_VERIFIED';
ALTER TYPE "NotificationType" ADD VALUE 'REPORT_RECEIVED';

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_id_fkey" FOREIGN KEY ("id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
