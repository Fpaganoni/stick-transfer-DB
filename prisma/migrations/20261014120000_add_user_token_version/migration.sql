-- Session revocation. Every session JWT carries the user's tokenVersion as `tv`;
-- bumping the column invalidates all tokens issued before.
--
-- Additive and safe to deploy ahead of the code: existing rows get 0, and tokens
-- issued before this migration have no `tv`, which the backend treats as 0.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
