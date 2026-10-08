/*
  Warnings:

  - You are about to drop the column `location` on the `Club` table. All the data in the column will be lost.
  - You are about to drop the `Profile` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[name]` on the table `Club` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `city` to the `Club` table without a default value. This is not possible if the table is not empty.
  - Added the required column `country` to the `Club` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.
  - Made the column `password` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_userId_fkey";

-- AlterTable - Add columns to Club with temp defaults
ALTER TABLE "Club" DROP COLUMN "location",
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "city" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'Unknown',
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "league" TEXT,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable - Add Post relations
ALTER TABLE "Post" ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable - Add columns to User with temp default for name
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "clubId" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT 'User',
ADD COLUMN     "position" TEXT,
ADD COLUMN     "yearsOfExperience" INTEGER,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "password" SET NOT NULL;

-- Migrate Profile data to User (bio and avatar)
UPDATE "User" u
SET 
  "bio" = p."bio",
  "avatar" = p."avatarUrl",
  "name" = COALESCE(p."displayName", u."username", 'User ' || SUBSTRING(u."id", 1, 8))
FROM "Profile" p
WHERE u."id" = p."userId";

-- Set name for users without profile
UPDATE "User"
SET "name" = COALESCE("username", 'User ' || SUBSTRING("id", 1, 8))
WHERE "name" = 'User';

-- DropTable
DROP TABLE "Profile";

-- Remove temp DEFAULT from User.name (keep the values, just remove the default)
ALTER TABLE "User" ALTER COLUMN "name" DROP DEFAULT;

-- Remove temp DEFAULTs from Club (keep the values, just remove the default)
ALTER TABLE "Club" ALTER COLUMN "city" DROP DEFAULT;
ALTER TABLE "Club" ALTER COLUMN "country" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Club_name_key" ON "Club"("name");

-- CreateIndex
CREATE INDEX "Club_country_city_idx" ON "Club"("country", "city");

-- CreateIndex
CREATE INDEX "Club_league_idx" ON "Club"("league");

-- CreateIndex
CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_clubId_createdAt_idx" ON "Post"("clubId", "createdAt");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_clubId_idx" ON "User"("clubId");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
