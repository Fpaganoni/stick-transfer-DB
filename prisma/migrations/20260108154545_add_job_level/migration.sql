-- CreateEnum
CREATE TYPE "JobLevel" AS ENUM ('PROFESSIONAL', 'AMATEUR');

-- AlterTable
ALTER TABLE "JobOpportunity" ADD COLUMN     "level" "JobLevel" NOT NULL DEFAULT 'PROFESSIONAL';
