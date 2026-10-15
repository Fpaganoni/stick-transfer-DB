/** Statuses a club may set on its own job opportunity. */
export const JOB_STATUSES = ["OPEN", "CLOSED", "FILLED"] as const;
export type JobStatusValue = (typeof JOB_STATUSES)[number];

/** Application statuses that still wait for an answer from the club. */
export const UNANSWERED_APPLICATION_STATUSES = ["PENDING", "UNDER_REVIEW"] as const;

/** A FILLED job can be deleted even with unanswered applications after this many days. */
export const FILLED_DELETE_COOLDOWN_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type JobDeletionDecision =
  | { allowed: true }
  | { allowed: false; reason: "UNANSWERED_APPLICATIONS" }
  | { allowed: false; reason: "FILLED_COOLDOWN"; availableAt: Date };

export interface JobDeletionInput {
  status: string;
  filledAt: Date | null;
  unansweredCount: number;
  now: Date;
}

export function filledCooldownEnd(filledAt: Date): Date {
  return new Date(filledAt.getTime() + FILLED_DELETE_COOLDOWN_DAYS * DAY_MS);
}

/**
 * A job may be deleted when every application was answered, or when it has been
 * FILLED for at least FILLED_DELETE_COOLDOWN_DAYS.
 */
export function evaluateJobDeletion(input: JobDeletionInput): JobDeletionDecision {
  if (input.unansweredCount === 0) return { allowed: true };

  if (input.status === "FILLED" && input.filledAt) {
    const availableAt = filledCooldownEnd(input.filledAt);
    if (input.now.getTime() >= availableAt.getTime()) return { allowed: true };
    return { allowed: false, reason: "FILLED_COOLDOWN", availableAt };
  }

  return { allowed: false, reason: "UNANSWERED_APPLICATIONS" };
}
