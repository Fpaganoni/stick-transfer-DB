/**
 * Deletes the accounts left behind by the front e2e suite (e2e-club-*, e2e-visitor-*).
 *
 *   pnpm prisma:cleanup-e2e            dry run: lists what would be deleted
 *   pnpm prisma:cleanup-e2e --apply    deletes them (local database only)
 *   pnpm prisma:cleanup-e2e --apply --allow-remote   same, on a remote dev database
 *
 * It prints the database host first and refuses to delete on a non-local host without
 * --allow-remote, so a .env pointing at the wrong database cannot be wiped by accident.
 *
 * The club account cannot be deleted from the app, so each e2e run leaves one behind.
 * Deleting the User cascades to its Club, vacancies, applications, follows and messages.
 * It does NOT delete the crest the suite uploaded to Cloudinary.
 */
import { PrismaClient } from "@prisma/client";
import { databaseHost, isE2eAccountEmail, isLocalDatabaseHost } from "../../src/common/e2e-accounts";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run with NODE_ENV=production");
  }
  const apply = process.argv.includes("--apply");
  const host = databaseHost(process.env.DATABASE_URL);
  console.log(`database host: ${host || "(unknown)"}`);
  // NODE_ENV is not enough: Prisma reads DATABASE_URL from .env whatever it says
  if (apply && !isLocalDatabaseHost(host) && !process.argv.includes("--allow-remote")) {
    throw new Error(
      `Refusing to delete on a non-local database (${host || "unknown host"}). ` +
        "If this really is the dev database, run again with --apply --allow-remote.",
    );
  }

  const candidates = await prisma.user.findMany({
    where: { email: { startsWith: "e2e-", endsWith: "@hockey-test.com" } },
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  // The database filter is only a prefilter: the strict matcher decides
  const accounts = candidates.filter((user) => isE2eAccountEmail(user.email));

  console.log(`${accounts.length} e2e account(s) found${apply ? "" : " (dry run, nothing deleted)"}`);
  for (const account of accounts) {
    console.log(`  ${account.role.padEnd(7)} ${account.email}  ${account.createdAt.toISOString()}`);
  }
  if (!apply || accounts.length === 0) {
    if (!apply && accounts.length > 0) console.log("Run again with --apply to delete them.");
    return;
  }

  let deleted = 0;
  for (const account of accounts) {
    try {
      await prisma.user.delete({ where: { id: account.id } });
      deleted += 1;
    } catch (error) {
      console.error(`  could not delete ${account.email}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log(`${deleted} of ${accounts.length} deleted`);
  if (deleted < accounts.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
