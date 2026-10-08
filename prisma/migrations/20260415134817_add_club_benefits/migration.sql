-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[];
