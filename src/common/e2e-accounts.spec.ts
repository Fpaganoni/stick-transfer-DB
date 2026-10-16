import { databaseHost, isE2eAccountEmail, isLocalDatabaseHost } from "./e2e-accounts";

describe("databaseHost", () => {
  it("reads the host of a postgres url without exposing credentials", () => {
    expect(databaseHost("postgresql://user:secret@db.example.com:5432/app?schema=public")).toBe(
      "db.example.com",
    );
  });

  it("is empty for a missing or malformed url", () => {
    expect(databaseHost(undefined)).toBe("");
    expect(databaseHost("not a url")).toBe("");
  });
});

describe("isLocalDatabaseHost", () => {
  it.each(["localhost", "127.0.0.1", "::1", "[::1]"])("treats %s as local", (host) => {
    expect(isLocalDatabaseHost(host)).toBe(true);
  });

  it.each(["db.example.com", "10.0.0.5", "localhost.evil.com", "", "prod-localhost"])(
    "does not treat %s as local",
    (host) => {
      expect(isLocalDatabaseHost(host)).toBe(false);
    },
  );
});

describe("isE2eAccountEmail", () => {
  it.each([
    "e2e-club-1760000000000@hockey-test.com",
    "e2e-visitor-1760000000000@hockey-test.com",
  ])("matches the account the e2e suite creates: %s", (email) => {
    expect(isE2eAccountEmail(email)).toBe(true);
  });

  it.each([
    "superadmin@hockey-test.com",
    "admin.campomadrid@hockey-test.com",
    "e2e-club-1760000000000@gmail.com",
    "e2e-club-1760000000000@hockey-test.com.evil.com",
    "x-e2e-club-1760000000000@hockey-test.com",
    "e2e-club-@hockey-test.com",
    "e2e-club-12ab@hockey-test.com",
    "e2e-admin-1760000000000@hockey-test.com",
    "",
  ])("never matches a real or seeded account: %s", (email) => {
    expect(isE2eAccountEmail(email)).toBe(false);
  });
});
