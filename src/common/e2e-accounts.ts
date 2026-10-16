/**
 * Accounts the front e2e suite creates against the dev database (tests/e2e/club-flow.spec.ts):
 * e2e-club-<timestamp>@hockey-test.com and e2e-visitor-<timestamp>@hockey-test.com.
 * Strict on purpose: the cleanup script deletes whatever this matches, so it must never
 * match a seeded or a real account.
 */
const E2E_EMAIL = /^e2e-(club|visitor)-\d+@hockey-test\.com$/;

export function isE2eAccountEmail(email: string): boolean {
  return E2E_EMAIL.test(email);
}

/** Host of a database url, or "" when it is missing or malformed. Never returns credentials. */
export function databaseHost(databaseUrl: string | undefined): string {
  if (!databaseUrl) return "";
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalDatabaseHost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}
