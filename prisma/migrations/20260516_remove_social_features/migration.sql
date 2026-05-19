-- Migration: Remove social features (posts, comments, likes, follows, stories, shares, profile_likes)
-- Stick Transfer refactor — keep jobs, clubs, messaging, notifications

-- Drop dependent tables first (FK order)

DROP TABLE IF EXISTS "StoryView" CASCADE;
DROP TABLE IF EXISTS "Story" CASCADE;
DROP TABLE IF EXISTS "Share" CASCADE;
DROP TABLE IF EXISTS "CommentLike" CASCADE;
DROP TABLE IF EXISTS "Comment" CASCADE;
DROP TABLE IF EXISTS "Like" CASCADE;
DROP TABLE IF EXISTS "Post" CASCADE;
DROP TABLE IF EXISTS "Follow" CASCADE;
DROP TABLE IF EXISTS "ProfileLike" CASCADE;

-- Remove postId column from Notification (no longer referencing Post)
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "postId";

-- Clean up NotificationType enum: keep only job/club types
-- PostgreSQL does not support removing enum values directly.
-- Replace the column type with the new restricted enum.

-- Step 1: Rename old enum
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";

-- Step 2: Create new enum with only the values we keep
CREATE TYPE "NotificationType" AS ENUM ('CLUB_INVITE', 'CLUB_ACCEPT', 'JOB_APPLICATION_UPDATE');

-- Step 3: Migrate existing rows (rows with removed types are deleted to avoid orphan data)
DELETE FROM "Notification" WHERE "type"::text NOT IN ('CLUB_INVITE', 'CLUB_ACCEPT', 'JOB_APPLICATION_UPDATE');

-- Step 4: Swap the column type
ALTER TABLE "Notification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::text::"NotificationType";

-- Step 5: Drop old enum
DROP TYPE "NotificationType_old";

-- Drop Visibility enum (was used only by Post)
DROP TYPE IF EXISTS "Visibility";

-- Drop FollowerType enum (was used by Follow and ProfileLike)
DROP TYPE IF EXISTS "FollowerType";

-- Drop AuthorType enum (was unused)
DROP TYPE IF EXISTS "AuthorType";
