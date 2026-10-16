import { AppError, FieldError } from "./errors/app.error";
import { cloudNameFromEnv } from "../uploads/image-url";

const MAX_URL_LENGTH = 2048;
const CLOUDINARY_HOST = "res.cloudinary.com";

/** No whitespace, control chars, quotes, angle brackets, backticks or backslashes: safe inside HTML attributes. */
const SAFE_URL_CHARS = /^[^\s\u0000-\u001f\u007f"'<>`\\]+$/;
/** Digits with the usual separators; 5-30 chars. */
const PHONE_PATTERN = /^\+?\(?[0-9][0-9 ()\-.]{3,27}[0-9]$/;

function parse(value: string): URL | null {
  if (value.length > MAX_URL_LENGTH || !SAFE_URL_CHARS.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * A link a visitor may click: plain http(s), no embedded credentials.
 * Rejects javascript:, data:, file: and the like.
 */
export function checkPublicHttpUrl(field: string, value: string): FieldError | null {
  const url = parse(value);
  const valid =
    !!url &&
    (url.protocol === "https:" || url.protocol === "http:") &&
    !!url.hostname &&
    !url.username &&
    !url.password;
  return valid
    ? null
    : { field, code: "URL_INVALID", message: `${field} must be a valid http(s) url` };
}

/**
 * A document (CV, certificate, resume, verification doc) uploaded through the app:
 * https on Cloudinary, no embedded credentials or custom port.
 */
export function checkCloudinaryDocumentUrl(field: string, value: string): FieldError | null {
  const url = parse(value);
  // res.cloudinary.com serves every Cloudinary account: pin this app's own cloud
  // so a file uploaded to someone else's free account cannot pass as ours. With
  // no account configured nothing can be uploaded, so only the host is checked.
  const cloudName = cloudNameFromEnv();
  const valid =
    !!url &&
    url.protocol === "https:" &&
    url.hostname === CLOUDINARY_HOST &&
    !url.port &&
    !url.username &&
    !url.password &&
    (!cloudName || url.pathname.startsWith(`/${cloudName}/`));
  return valid
    ? null
    : {
        field,
        code: "DOCUMENT_URL_INVALID",
        message: `${field} must be a document uploaded through the app`,
      };
}

/**
 * A document that lives directly in `ownerFolder` (e.g. "stick-transfer/clubs/<id>"):
 * the same checks as checkCloudinaryDocumentUrl plus the owner's folder, so one
 * account cannot present a file uploaded by another as its own proof.
 */
export function checkOwnedCloudinaryDocumentUrl(
  field: string,
  value: string,
  ownerFolder: string,
): FieldError | null {
  const base = checkCloudinaryDocumentUrl(field, value);
  if (base) return base;

  const escapedFolder = ownerFolder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const owned = new RegExp(`/(?:image|raw)/upload/(?:v\\d+/)?${escapedFolder}/[^/]+$`).test(
    new URL(value).pathname,
  );
  return owned
    ? null
    : {
        field,
        code: "DOCUMENT_URL_INVALID",
        message: `${field} must be a document uploaded to your own folder`,
      };
}

export function checkPhone(field: string, value: string): FieldError | null {
  return PHONE_PATTERN.test(value.trim())
    ? null
    : { field, code: "PHONE_INVALID", message: `${field} is not a valid phone number` };
}

/** Throws a 400 VALIDATION_ERROR listing every failed check; no-op when all pass. */
export function throwIfInvalid(errors: Array<FieldError | null>): void {
  const failed = errors.filter((error): error is FieldError => error !== null);
  if (failed.length > 0) throw AppError.validation(failed);
}
