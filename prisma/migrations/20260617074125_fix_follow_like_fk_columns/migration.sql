-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_followedClub_fkey";

-- DropForeignKey
ALTER TABLE "Follow" DROP CONSTRAINT "Follow_followedUser_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_likedClub_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_likedUser_fkey";

-- AlterTable
ALTER TABLE "Follow" ADD COLUMN     "followingClubId" TEXT,
ADD COLUMN     "followingUserId" TEXT;

-- AlterTable
ALTER TABLE "Like" ADD COLUMN     "likedClubId" TEXT,
ADD COLUMN     "likedUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followedUser_fkey" FOREIGN KEY ("followingUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followedClub_fkey" FOREIGN KEY ("followingClubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_likedUser_fkey" FOREIGN KEY ("likedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_likedClub_fkey" FOREIGN KEY ("likedClubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
