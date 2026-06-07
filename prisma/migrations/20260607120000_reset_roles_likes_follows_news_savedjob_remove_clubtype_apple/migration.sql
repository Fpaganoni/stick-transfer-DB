-- CreateEnum
CREATE TYPE "UserLevel" AS ENUM ('PROFESSIONAL', 'AMATEUR');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MEN', 'WOMEN', 'MIXED');

-- CreateEnum
CREATE TYPE "NewsCategory" AS ENUM ('INTERNATIONAL', 'NATIONAL', 'TRANSFERS', 'EQUIPMENT', 'RESULTS');

-- CreateEnum
CREATE TYPE "FollowEntityType" AS ENUM ('USER', 'CLUB');

-- CreateEnum
CREATE TYPE "LikeEntityType" AS ENUM ('USER', 'CLUB');

-- AlterEnum
BEGIN;
CREATE TYPE "AuthProvider_new" AS ENUM ('EMAIL', 'GOOGLE', 'FACEBOOK', 'LINKEDIN', 'TWITTER');
ALTER TABLE "User" ALTER COLUMN "authProvider" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "authProvider" TYPE "AuthProvider_new" USING ("authProvider"::text::"AuthProvider_new");
ALTER TYPE "AuthProvider" RENAME TO "AuthProvider_old";
ALTER TYPE "AuthProvider_new" RENAME TO "AuthProvider";
DROP TYPE "AuthProvider_old";
ALTER TABLE "User" ALTER COLUMN "authProvider" SET DEFAULT 'EMAIL';
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'NEW_FOLLOWER';
ALTER TYPE "NotificationType" ADD VALUE 'NEW_LIKE';
ALTER TYPE "NotificationType" ADD VALUE 'APPLICATION_RECEIVED';

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('PLAYER', 'COACH', 'CLUB', 'SUPERADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PLAYER';
COMMIT;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "videos" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "JobOpportunity" ADD COLUMN     "division" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "level" "UserLevel";

-- CreateTable
CREATE TABLE "SavedJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobOpportunityId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followerType" "FollowEntityType" NOT NULL,
    "followingId" TEXT NOT NULL,
    "followingType" "FollowEntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Like" (
    "id" TEXT NOT NULL,
    "likerId" TEXT NOT NULL,
    "likerType" "LikeEntityType" NOT NULL,
    "likedId" TEXT NOT NULL,
    "likedType" "LikeEntityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "coverImage" TEXT,
    "category" "NewsCategory" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "readingTimeMinutes" INTEGER,
    "authorName" TEXT,
    "authorAvatar" TEXT,
    "relatedSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedJob_userId_idx" ON "SavedJob"("userId");

-- CreateIndex
CREATE INDEX "SavedJob_jobOpportunityId_idx" ON "SavedJob"("jobOpportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_userId_jobOpportunityId_key" ON "SavedJob"("userId", "jobOpportunityId");

-- CreateIndex
CREATE INDEX "Follow_followerId_followerType_idx" ON "Follow"("followerId", "followerType");

-- CreateIndex
CREATE INDEX "Follow_followingId_followingType_idx" ON "Follow"("followingId", "followingType");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followerType_followingId_followingType_key" ON "Follow"("followerId", "followerType", "followingId", "followingType");

-- CreateIndex
CREATE INDEX "Like_likerId_likerType_idx" ON "Like"("likerId", "likerType");

-- CreateIndex
CREATE INDEX "Like_likedId_likedType_idx" ON "Like"("likedId", "likedType");

-- CreateIndex
CREATE UNIQUE INDEX "Like_likerId_likerType_likedId_likedType_key" ON "Like"("likerId", "likerType", "likedId", "likedType");

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_slug_key" ON "NewsArticle"("slug");

-- CreateIndex
CREATE INDEX "NewsArticle_slug_idx" ON "NewsArticle"("slug");

-- CreateIndex
CREATE INDEX "NewsArticle_category_isPublished_idx" ON "NewsArticle"("category", "isPublished");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobOpportunityId_fkey" FOREIGN KEY ("jobOpportunityId") REFERENCES "JobOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerUser_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followedUser_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followedClub_fkey" FOREIGN KEY ("followingId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_likerUser_fkey" FOREIGN KEY ("likerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_likedUser_fkey" FOREIGN KEY ("likedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_likedClub_fkey" FOREIGN KEY ("likedId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

