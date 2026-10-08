import { AppError } from "../common/errors/app.error";

export type ImageUploadTarget =
  | "USER_AVATAR"
  | "USER_COVER"
  | "CLUB_LOGO"
  | "CLUB_COVER";

export type ImageOwnerKind = "users" | "clubs";

/** Profile image columns that hold a Cloudinary url. Also the error `field`. */
export type ImageField = "avatar" | "coverImage" | "logo";

const IMAGE_ROOT_FOLDER = "stick-transfer";
const CLOUDINARY_HOST = "res.cloudinary.com";
/** No quotes, parentheses, spaces, control chars or ";": safe inside CSS url() and HTML. */
const SAFE_URL_CHARS = /^[A-Za-z0-9._~/:-]+$/;

/**
 * Where each upload target lands. `publicId` is fixed per target so a new
 * upload overwrites the previous one instead of leaving orphaned files.
 */
export const IMAGE_UPLOAD_TARGETS: Readonly<
  Record<ImageUploadTarget, { owner: ImageOwnerKind; publicId: string }>
> = {
  USER_AVATAR: { owner: "users", publicId: "avatar" },
  USER_COVER: { owner: "users", publicId: "cover" },
  CLUB_LOGO: { owner: "clubs", publicId: "logo" },
  CLUB_COVER: { owner: "clubs", publicId: "club-cover" },
};

export function ownerImageFolder(kind: ImageOwnerKind, ownerId: string): string {
  return `${IMAGE_ROOT_FOLDER}/${kind}/${ownerId}`;
}

/** Cloud name from `cloudinary://<key>:<secret>@<cloud_name>`; never exposes the secret. */
export function cloudNameFromEnv(): string | undefined {
  const match = /^cloudinary:\/\/[^:@/]+:[^@/]+@([^/?#]+)/.exec(
    process.env.CLOUDINARY_URL ?? "",
  );
  return match?.[1];
}

function invalidImage(field: ImageField, message: string): AppError {
  return AppError.validation([{ field, code: "IMAGE_URL_INVALID", message }]);
}

function isInsideFolder(url: URL, cloudName: string, folder: string): boolean {
  if (url.protocol !== "https:" || url.hostname !== CLOUDINARY_HOST) return false;
  if (url.port || url.username || url.password || url.search || url.hash) return false;
  if (url.pathname.includes("..") || url.pathname.includes("%")) return false;

  const prefix = `/${cloudName}/image/upload/`;
  if (!url.pathname.startsWith(prefix)) return false;

  const withoutVersion = url.pathname.slice(prefix.length).replace(/^v\d+\//, "");
  return withoutVersion.startsWith(`${folder}/`);
}

/**
 * Validates an image url coming from a client. Returns the value to store:
 * `undefined` = unchanged, `null` = remove the image, otherwise the url.
 *
 * Accepted: omitted, null/"" (remove), the value already stored (the form
 * resends it and legacy urls must not break), or a Cloudinary url inside
 * `folder` (the owner's folder; see ownerImageFolder).
 */
export function assertOwnedImageUrl(opts: {
  field: ImageField;
  value: string | null | undefined;
  current: string | null | undefined;
  folder: string;
  cloudName: string | undefined;
}): string | null | undefined {
  const { field, value, current, folder, cloudName } = opts;

  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value === current) return value;

  // The raw string is what gets stored (and later rendered), so keep it plain
  if (!SAFE_URL_CHARS.test(value)) {
    throw invalidImage(field, `${field} must be an image uploaded through the app`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidImage(field, `${field} must be an image uploaded through the app`);
  }

  if (!cloudName || !isInsideFolder(url, cloudName, folder)) {
    throw invalidImage(field, `${field} must be an image uploaded through the app`);
  }
  return value;
}

type ImageValues = Partial<Record<ImageField, string | null | undefined>>;

/**
 * Validates every image field present in `input` against the owner's folder and
 * the stored `current` values. Returns only the fields to write ("" becomes null).
 */
export function resolveOwnedImages(opts: {
  kind: ImageOwnerKind;
  ownerId: string;
  input: ImageValues;
  current: ImageValues;
}): Partial<Record<ImageField, string | null>> {
  const folder = ownerImageFolder(opts.kind, opts.ownerId);
  const cloudName = cloudNameFromEnv();
  const result: Partial<Record<ImageField, string | null>> = {};

  for (const field of ["avatar", "coverImage", "logo"] as const) {
    const checked = assertOwnedImageUrl({
      field,
      value: opts.input[field],
      current: opts.current[field],
      folder,
      cloudName,
    });
    if (checked !== undefined) result[field] = checked;
  }
  return result;
}

/** Legacy base64 uploads: only jpeg, png and webp data urls. */
export function assertImageDataUrl(field: ImageField, base64: string): void {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(base64)) {
    throw AppError.validation([
      {
        field,
        code: "IMAGE_FORMAT_INVALID",
        message: "Image must be a jpeg, png or webp data url",
      },
    ]);
  }
}
