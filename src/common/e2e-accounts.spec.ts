import { isE2eAccountEmail } from "./e2e-accounts";

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
