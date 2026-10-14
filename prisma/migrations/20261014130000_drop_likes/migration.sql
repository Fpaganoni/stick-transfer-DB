-- Profile likes were removed: the product only has follow/unfollow.
--
-- DESTRUCTIVE: every row of "Like" is deleted. Its foreign keys, indexes, the
-- unique key and any CHECK constraint go with the table. Nothing else references
-- "Like" or the "LikeEntityType" enum (the API, the Prisma models and the
-- frontend no longer use them). The NotificationType value NEW_LIKE is kept on
-- purpose so existing Notification rows stay valid.
DROP TABLE "Like";
DROP TYPE "LikeEntityType";
