-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable: Add missing fields to Club
ALTER TABLE "Club" ADD COLUMN "instagram" TEXT;
ALTER TABLE "Club" ADD COLUMN "twitter" TEXT;
ALTER TABLE "Club" ADD COLUMN "facebook" TEXT;
ALTER TABLE "Club" ADD COLUMN "tiktok" TEXT;
ALTER TABLE "Club" ADD COLUMN "adminId" TEXT;
ALTER TABLE "Club" ADD COLUMN "verificationStatus" "VerificationStatus" DEFAULT 'UNVERIFIED';
ALTER TABLE "Club" ADD COLUMN "verificationDoc" TEXT;

-- Add Foreign Key for adminId
ALTER TABLE "Club" ADD CONSTRAINT "Club_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add Unique Constraint for adminId
ALTER TABLE "Club" ADD CONSTRAINT "Club_adminId_key" UNIQUE ("adminId");
