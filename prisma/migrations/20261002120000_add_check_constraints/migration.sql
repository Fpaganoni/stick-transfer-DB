-- Data integrity CHECK constraints.
-- Prisma cannot model CHECK constraints in schema.prisma, so they live only in
-- this migration (they do not cause drift in `prisma migrate dev`).
--
-- Constraints on columns that already existed are added NOT VALID: they are
-- enforced for every new INSERT/UPDATE but existing rows are not scanned, so
-- the migration cannot fail on legacy data. After cleaning any bad rows run:
--   ALTER TABLE "<table>" VALIDATE CONSTRAINT "<name>";
-- Constraints on columns introduced with the UMPIRE role are fully validated.

-- User: umpire columns (new, all NULL today)
ALTER TABLE "User" ADD CONSTRAINT "User_matchesOfficiated_nonneg_check"
  CHECK ("matchesOfficiated" IS NULL OR "matchesOfficiated" >= 0);

ALTER TABLE "User" ADD CONSTRAINT "User_certificationYear_range_check"
  CHECK ("certificationYear" IS NULL OR "certificationYear" BETWEEN 1950 AND 2100);

-- User: pre-existing column
ALTER TABLE "User" ADD CONSTRAINT "User_yearsOfExperience_nonneg_check"
  CHECK ("yearsOfExperience" IS NULL OR "yearsOfExperience" >= 0) NOT VALID;

-- Club
ALTER TABLE "Club" ADD CONSTRAINT "Club_foundedYear_range_check"
  CHECK ("foundedYear" IS NULL OR "foundedYear" BETWEEN 1800 AND 2100) NOT VALID;

-- JobOpportunity
ALTER TABLE "JobOpportunity" ADD CONSTRAINT "JobOpportunity_salary_nonneg_check"
  CHECK ("salary" IS NULL OR "salary" >= 0) NOT VALID;

-- Trajectory: a period cannot end before it starts
ALTER TABLE "Trajectory" ADD CONSTRAINT "Trajectory_dates_order_check"
  CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate") NOT VALID;

-- ConversationParticipant
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_unreadCount_nonneg_check"
  CHECK ("unreadCount" >= 0) NOT VALID;

-- Follow / Like: an entity cannot follow or like itself
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_no_self_follow_check"
  CHECK (NOT ("followerType" = "followingType" AND "followerId" = "followingId")) NOT VALID;

ALTER TABLE "Like" ADD CONSTRAINT "Like_no_self_like_check"
  CHECK (NOT ("likerType" = "likedType" AND "likerId" = "likedId")) NOT VALID;
