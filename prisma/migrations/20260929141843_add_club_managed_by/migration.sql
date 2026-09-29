-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "managedByFirstName" TEXT,
ADD COLUMN     "managedByLastName" TEXT;

-- Backfill existing clubs with a placeholder; must be corrected manually per club.
UPDATE "Club" SET "managedByFirstName" = 'Sin definir', "managedByLastName" = 'Sin definir'
WHERE "managedByFirstName" IS NULL;

-- AlterTable
ALTER TABLE "Club" ALTER COLUMN "managedByFirstName" SET NOT NULL,
ALTER COLUMN "managedByLastName" SET NOT NULL;
