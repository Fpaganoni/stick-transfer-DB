import {
  FILLED_DELETE_COOLDOWN_DAYS,
  JOB_STATUSES,
  evaluateJobDeletion,
  filledCooldownEnd,
} from "./job-deletion-rules";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-15T12:00:00.000Z");

describe("job-deletion-rules", () => {
  it("exposes the closed list of job statuses", () => {
    expect(JOB_STATUSES).toEqual(["OPEN", "CLOSED", "FILLED"]);
  });

  it("uses a 14 day cooldown", () => {
    expect(FILLED_DELETE_COOLDOWN_DAYS).toBe(14);
  });

  describe("filledCooldownEnd", () => {
    it("is filledAt plus 14 days", () => {
      const filledAt = new Date("2026-10-01T12:00:00.000Z");
      expect(filledCooldownEnd(filledAt).toISOString()).toBe("2026-10-15T12:00:00.000Z");
    });
  });

  describe("evaluateJobDeletion", () => {
    it("allows a job with no applications", () => {
      expect(
        evaluateJobDeletion({ status: "OPEN", filledAt: null, unansweredCount: 0, now: NOW }),
      ).toEqual({ allowed: true });
    });

    it("allows a closed job when every application is answered", () => {
      expect(
        evaluateJobDeletion({ status: "CLOSED", filledAt: null, unansweredCount: 0, now: NOW }),
      ).toEqual({ allowed: true });
    });

    it("blocks a job with unanswered applications", () => {
      expect(
        evaluateJobDeletion({ status: "OPEN", filledAt: null, unansweredCount: 2, now: NOW }),
      ).toEqual({ allowed: false, reason: "UNANSWERED_APPLICATIONS" });
    });

    it("blocks a filled job with unanswered applications inside the cooldown", () => {
      const filledAt = new Date(NOW.getTime() - 13 * DAY_MS);
      expect(
        evaluateJobDeletion({ status: "FILLED", filledAt, unansweredCount: 1, now: NOW }),
      ).toEqual({
        allowed: false,
        reason: "FILLED_COOLDOWN",
        availableAt: filledCooldownEnd(filledAt),
      });
    });

    it("allows a filled job with unanswered applications after 14 days", () => {
      const filledAt = new Date(NOW.getTime() - 14 * DAY_MS);
      expect(
        evaluateJobDeletion({ status: "FILLED", filledAt, unansweredCount: 3, now: NOW }),
      ).toEqual({ allowed: true });
    });

    it("blocks a filled job without filledAt that has unanswered applications", () => {
      expect(
        evaluateJobDeletion({ status: "FILLED", filledAt: null, unansweredCount: 1, now: NOW }),
      ).toEqual({ allowed: false, reason: "UNANSWERED_APPLICATIONS" });
    });

    it("allows a filled job inside the cooldown when all applications are answered", () => {
      const filledAt = new Date(NOW.getTime() - 1 * DAY_MS);
      expect(
        evaluateJobDeletion({ status: "FILLED", filledAt, unansweredCount: 0, now: NOW }),
      ).toEqual({ allowed: true });
    });
  });
});
