import { isEmail } from "class-validator";
import { AppError, FieldError } from "../../common/errors/app.error";

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt silently ignores everything after 72 bytes, so reject longer input. */
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MAX_LENGTH = 100;
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "moderator",
  "superadmin",
  "system",
  "staff",
  "stick",
  "sticktransfer",
  "null",
  "undefined",
  "me",
  "api",
  "graphql",
]);

/** Lowercase; only entries that pass the character rules matter (e.g. "Password1!"). */
const COMMON_PASSWORDS = new Set([
  "password1!",
  "password123!",
  "password@123",
  "qwerty123!",
  "welcome1!",
  "welcome123!",
  "admin123!",
  "letmein123!",
  "hockey123!",
  "sticktransfer1!",
  "p@ssw0rd",
  "p@ssw0rd1",
  "p@ssword1",
]);

export function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

export function normalizeUsername(username?: string | null): string | undefined {
  const value = username?.trim().toLowerCase();
  return value ? value : undefined;
}

function fail(field: string, code: string, message: string): FieldError {
  return { field, code, message };
}

export function checkEmail(email: string): FieldError | null {
  if (!email) return fail("email", "EMAIL_REQUIRED", "Email is required");
  if (email.length > EMAIL_MAX_LENGTH) {
    return fail("email", "EMAIL_TOO_LONG", `Email must be at most ${EMAIL_MAX_LENGTH} characters`);
  }
  if (!isEmail(email)) return fail("email", "EMAIL_INVALID", "Email format is invalid");
  return null;
}

export function checkPassword(password?: string | null): FieldError | null {
  if (!password) return fail("password", "PASSWORD_REQUIRED", "Password is required");
  if (password.length < PASSWORD_MIN_LENGTH) {
    return fail("password", "PASSWORD_TOO_SHORT", `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
    return fail("password", "PASSWORD_TOO_LONG", `Password must be at most ${PASSWORD_MAX_BYTES} bytes`);
  }
  if (!/[a-z]/.test(password)) {
    return fail("password", "PASSWORD_NEEDS_LOWERCASE", "Password needs a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    return fail("password", "PASSWORD_NEEDS_UPPERCASE", "Password needs an uppercase letter");
  }
  if (!/[0-9]/.test(password)) {
    return fail("password", "PASSWORD_NEEDS_NUMBER", "Password needs a number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return fail("password", "PASSWORD_NEEDS_SYMBOL", "Password needs a symbol");
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return fail("password", "PASSWORD_TOO_COMMON", "Password is too common");
  }
  return null;
}

/** `username` must already be normalized (see normalizeUsername). Undefined = not provided. */
export function checkUsername(username?: string): FieldError | null {
  if (username === undefined) return null;
  if (!USERNAME_PATTERN.test(username)) {
    return fail("username", "USERNAME_INVALID", "Username must be 3-20 characters: letters, numbers and _");
  }
  if (RESERVED_USERNAMES.has(username)) {
    return fail("username", "USERNAME_RESERVED", "Username is reserved");
  }
  return null;
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username);
}

/**
 * Derives a valid username base from an email's local part (OAuth sign-up).
 * Result matches the username rules (a-z, 0-9, _; 3-16 chars, leaving room for
 * a numeric suffix); the caller must still resolve reserved names/collisions.
 */
export function usernameBaseFromEmail(email: string): string {
  const local = email.split("@")[0].toLowerCase();
  let base = local
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  if (base.length < 3) base = `user${base}`.slice(0, 16);
  return base;
}

export function checkName(name?: string | null): FieldError | null {
  const value = name?.trim();
  if (!value) return fail("name", "NAME_REQUIRED", "Name is required");
  if (value.length > NAME_MAX_LENGTH) {
    return fail("name", "NAME_TOO_LONG", `Name must be at most ${NAME_MAX_LENGTH} characters`);
  }
  return null;
}

export interface RegisterCredentials {
  email: string;
  name: string;
  password?: string;
  username?: string;
}

/**
 * Normalizes and validates the register credentials, collecting one error per
 * failing field. Throws AppError VALIDATION_ERROR, or returns the clean values.
 */
export function validateRegisterCredentials(input: {
  email: string;
  name: string;
  password?: string;
  username?: string | null;
}): RegisterCredentials {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const name = (input.name ?? "").trim();

  const errors = [
    checkEmail(email),
    checkName(name),
    checkUsername(username),
    checkPassword(input.password),
  ].filter((e): e is FieldError => e !== null);

  if (errors.length) throw AppError.validation(errors);
  return { email, name, username, password: input.password };
}

/** Validates a username on profile update (undefined = unchanged). */
export function validateUsernameOrThrow(username?: string | null): string | undefined {
  const normalized = normalizeUsername(username);
  const error = checkUsername(normalized);
  if (error) throw AppError.validation([error]);
  return normalized;
}
