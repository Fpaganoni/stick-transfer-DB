import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Stable, machine-readable error codes. The frontend maps these to user-facing
 * messages, so never rename one without coordinating with the client.
 */
export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_TAKEN"
  | "USERNAME_TAKEN"
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

  static invalidCredentials() {
    return new AppError(
      "INVALID_CREDENTIALS",
      "Invalid credentials",
      HttpStatus.UNAUTHORIZED,
    );
  }
}
