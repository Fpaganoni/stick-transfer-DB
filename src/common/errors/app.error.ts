import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Stable, machine-readable error codes. The frontend maps these to user-facing
 * messages, so never rename one without coordinating with the client.
 */
export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
  | "CLUB_NAME_TAKEN"
  | "JOB_HAS_UNANSWERED_APPLICATIONS"
  | "JOB_FILLED_COOLDOWN"
  | "ROLE_CHANGE_NOT_ALLOWED"
  | "ACTIVE_JOBS_LIMIT_REACHED"
  | "INVALID_CREDENTIALS"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/** One failed rule on one input field (e.g. `{ field: "password", code: "PASSWORD_TOO_SHORT" }`). */
export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/**
 * HttpException carrying a stable `code` plus optional `field`/`fields`.
 * `formatError` in graphql.module.ts lifts these into `extensions`.
 */
export class AppError extends HttpException {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    status: HttpStatus,
    public readonly field?: string,
    public readonly fields?: FieldError[],
  ) {
    super({ message, code, field, fields, statusCode: status }, status);
  }

  static validation(fields: FieldError[]) {
    return new AppError(
      "VALIDATION_ERROR",
      "Validation Error",
      HttpStatus.BAD_REQUEST,
      fields[0]?.field,
      fields,
    );
  }

  static emailTaken() {
    return new AppError(
      "EMAIL_TAKEN",
      "Email already registered",
      HttpStatus.CONFLICT,
      "email",
    );
  }

  static usernameTaken() {
    return new AppError(
      "USERNAME_TAKEN",
      "Username not available",
      HttpStatus.CONFLICT,
      "username",
    );
  }

  /** `field` is "name" (updateClub/updateUser) or "clubName" (register). */
  static clubNameTaken(field: "name" | "clubName" = "name") {
    return new AppError(
      "CLUB_NAME_TAKEN",
      "Club name not available",
      HttpStatus.CONFLICT,
      field,
    );
  }

  static jobHasUnansweredApplications() {
    return new AppError(
      "JOB_HAS_UNANSWERED_APPLICATIONS",
      "Answer every application before deleting this job opportunity",
      HttpStatus.CONFLICT,
    );
  }

  /** `availableAt` is when a FILLED job becomes deletable (ISO 8601). */
  static jobFilledCooldown(availableAt: Date) {
    return new AppError(
      "JOB_FILLED_COOLDOWN",
      `A filled job opportunity can be deleted from ${availableAt.toISOString()}`,
      HttpStatus.CONFLICT,
    );
  }

  /** A role cannot be switched to or from CLUB: a club needs its Club row, name key and place. */
  static roleChangeNotAllowed() {
    return new AppError(
      "ROLE_CHANGE_NOT_ALLOWED",
      "Roles cannot be changed to or from CLUB",
      HttpStatus.BAD_REQUEST,
    );
  }

  /** A club keeps at most `max` vacancies OPEN, when it creates or reopens one. */
  static activeJobsLimitReached(max: number) {
    return new AppError(
      "ACTIVE_JOBS_LIMIT_REACHED",
      `Your club has reached the limit of ${max} active job opportunities`,
      HttpStatus.FORBIDDEN,
    );
  }

  static invalidCredentials() {
    return new AppError(
      "INVALID_CREDENTIALS",
      "Invalid credentials",
      HttpStatus.UNAUTHORIZED,
    );
  }
}
