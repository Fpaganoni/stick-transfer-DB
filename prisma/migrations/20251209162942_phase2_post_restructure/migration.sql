/*
  Warnings:

  - You are about to drop the column `authorId` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the column `authorType` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the `PostMedia` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `userId` on table `Post` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'FRIENDS', 'PRIVATE');

-- DropForeignKey
ALTER TABLE "PostMedia" DROP CONSTRAINT "PostMedia_postId_fkey";

-- DropIndex
DROP INDEX "Post_authorType_authorId_idx";

-- AlterTable - Add new columns first
ALTER TABLE "Post" 
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "images" TEXT[],
ADD COLUMN     "isClubPost" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';

-- Migrate PostMedia data to Post fields
-- Set imageUrl from the first IMAGE (order = 0)
UPDATE "Post" p
SET "imageUrl" = pm.url
FROM "PostMedia" pm
WHERE p.id = pm."postId"
  AND pm.type = 'IMAGE'
  AND pm."order" = 0;

-- Set images array from all IMAGE PostMedia ordered by order
UPDATE "Post" p
SET "images" = ARRAY(
  SELECT pm.url
  FROM "PostMedia" pm
  WHERE pm."postId" = p.id
    AND pm.type = 'IMAGE'
  ORDER BY pm."order"
);

-- Set videoUrl from first VIDEO PostMedia
UPDATE "Post" p
SET "videoUrl" = pm.url
FROM "PostMedia" pm
WHERE p.id = pm."postId"
  AND pm.type = 'VIDEO'
  AND pm.id = (
    SELECT id FROM "PostMedia"
    WHERE "postId" = p.id AND type = 'VIDEO'
    ORDER BY "order"
    LIMIT 1
  );

-- Set isClubPost based on clubId
UPDATE "Post"
SET "isClubPost" = ("clubId" IS NOT NULL);

-- Now drop old columns and make userId required
ALTER TABLE "Post" 
DROP COLUMN "authorId",
DROP COLUMN "authorType",
ALTER COLUMN "userId" SET NOT NULL;

-- DropTable
DROP TABLE "PostMedia";

-- DropEnum
DROP TYPE "MediaType";

-- DropEnum (AuthorType is no longer used anywhere)
DROP TYPE IF EXISTS "AuthorType";

-- CreateIndex
CREATE INDEX "Post_visibility_createdAt_idx" ON "Post"("visibility", "createdAt");

-- CreateIndex
CREATE INDEX "Post_isPinned_createdAt_idx" ON "Post"("isPinned", "createdAt");
