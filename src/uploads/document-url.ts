import { ownerImageFolder, ImageOwnerKind } from "./image-url";

/** Documents a client may upload straight to Cloudinary with a signature. */
export type DocumentUploadTarget = "CLUB_VERIFICATION";

/**
 * Where each document lands. `publicId` is fixed per target so a new upload
 * replaces the previous one instead of leaving orphaned files.
 */
export const DOCUMENT_UPLOAD_TARGETS: Readonly<
  Record<DocumentUploadTarget, { owner: ImageOwnerKind; publicId: string }>
> = {
  CLUB_VERIFICATION: { owner: "clubs", publicId: "verification-doc" },
};

/** Signed as `allowed_formats`; the browser must send the same value. */
export const DOCUMENT_ALLOWED_FORMATS = "pdf,doc,docx";

export function documentPublicId(target: DocumentUploadTarget, ownerId: string): string {
  const { owner, publicId } = DOCUMENT_UPLOAD_TARGETS[target];
  return `${ownerImageFolder(owner, ownerId)}/${publicId}`;
}
