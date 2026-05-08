-- CreateEnum for VerificationStatus removed because it was already created in a previous migration
-- CREATE TYPE "VerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable: Change verificationStatus from TEXT to VerificationStatus ENUM
ALTER TABLE "Club" ALTER COLUMN "verificationStatus" DROP DEFAULT;
ALTER TABLE "Club" ALTER COLUMN "verificationStatus" TYPE "VerificationStatus" USING "verificationStatus"::"VerificationStatus";
ALTER TABLE "Club" ALTER COLUMN "verificationStatus" SET DEFAULT 'UNVERIFIED';
