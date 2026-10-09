-- Data integrity: User.dateOfBirth cannot be before 1900-01-01.
-- Prisma cannot model CHECK constraints, so this lives only in the migration
-- (no drift in `prisma migrate dev`). Style follows 20261002120000_add_check_constraints.
--
-- Added NOT VALID: enforced for every new INSERT/UPDATE, existing rows are not
-- scanned. After cleaning any bad rows run:
--   ALTER TABLE "User" VALIDATE CONSTRAINT "User_dateOfBirth_min_check";
--
-- The minimum age (16) and maximum age (100) are NOT enforced here: they depend
-- on the current date, which a CHECK cannot use immutably. They live in
-- checkDateOfBirth (src/users/validation/credentials.ts).
ALTER TABLE "User" ADD CONSTRAINT "User_dateOfBirth_min_check"
  CHECK ("dateOfBirth" IS NULL OR "dateOfBirth" >= DATE '1900-01-01') NOT VALID;
