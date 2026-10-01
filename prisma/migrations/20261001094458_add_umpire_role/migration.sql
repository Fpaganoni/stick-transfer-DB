-- CreateEnum
CREATE TYPE "UmpireLicenseLevel" AS ENUM ('REGIONAL', 'NACIONAL', 'INTERNACIONAL');

-- CreateEnum
CREATE TYPE "TravelAvailability" AS ENUM ('LOCAL', 'REGIONAL', 'NACIONAL', 'INTERNACIONAL');

-- CreateEnum
CREATE TYPE "UmpireModality" AS ENUM ('CESPED', 'SALA', 'INDOOR');

-- CreateEnum
CREATE TYPE "UmpireCategory" AS ENUM ('JUVENIL', 'MAYORES', 'MASCULINO', 'FEMENINO', 'VETERANOS');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'UMPIRE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "certificationYear" INTEGER,
ADD COLUMN     "certifyingBody" TEXT,
ADD COLUMN     "languages" TEXT[],
ADD COLUMN     "licenseLevel" "UmpireLicenseLevel",
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "matchesOfficiated" INTEGER,
ADD COLUMN     "modalities" "UmpireModality"[],
ADD COLUMN     "travelAvailability" "TravelAvailability",
ADD COLUMN     "umpireCategories" "UmpireCategory"[];

-- CreateTable
CREATE TABLE "UmpireCertification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "fileUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UmpireCertification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UmpireCertification_userId_idx" ON "UmpireCertification"("userId");

-- CreateIndex
CREATE INDEX "User_role_licenseLevel_idx" ON "User"("role", "licenseLevel");

-- AddForeignKey
ALTER TABLE "UmpireCertification" ADD CONSTRAINT "UmpireCertification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
