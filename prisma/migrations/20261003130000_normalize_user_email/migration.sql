-- Normalize User.email to lowercase.
-- The app now lowercases emails on register/login/OAuth, and Postgres unique
-- indexes are case-sensitive, so legacy mixed-case rows must be folded first.

-- Abort with a readable message if folding would create duplicates; resolve
-- those accounts manually (merge or delete) and re-run the migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" GROUP BY lower("email") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize emails: accounts exist whose emails differ only by case';
  END IF;
END $$;

UPDATE "User" SET "email" = lower("email") WHERE "email" <> lower("email");

-- Keeps any future writer (scripts, seeds, other services) honest.
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check"
  CHECK ("email" = lower("email"));
