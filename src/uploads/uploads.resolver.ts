import { Args, Context, ID, Mutation, Resolver } from "@nestjs/graphql";
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "../auth/auth.service";
import { CloudinaryService } from "./cloudinary.service";
import { IMAGE_UPLOAD_TARGETS, ImageUploadTarget } from "./image-url";
import { DocumentUploadTarget } from "./document-url";

/** Ids go into a Cloudinary path, so allow no separators or dots. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

@Resolver()
export class UploadsResolver {
  constructor(
    private cloudinary: CloudinaryService,
    private authService: AuthService,
  ) {}

  /**
   * Signs a direct browser -> Cloudinary upload into the caller's own folder.
   * User targets use the session user id. Club targets use the club id, which
   * equals its owner's user id; a super admin names the club via `clubId`.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Mutation()
  createImageUploadSignature(
    @Context() context: any,
    @Args("target") target: ImageUploadTarget,
    @Args("clubId", { type: () => ID, nullable: true }) clubId?: string,
  ) {
    const currentUser = this.authService.getUserFromRequest(context?.req);
    if (!currentUser) throw new UnauthorizedException("Authentication required");

    if (IMAGE_UPLOAD_TARGETS[target].owner === "users") {
      return this.cloudinary.signImageUpload(target, currentUser.userId);
    }

    return this.cloudinary.signImageUpload(
      target,
      this.clubOwnerId(currentUser, clubId),
    );
  }

  /**
   * Signs a direct browser -> Cloudinary document upload (club verification
   * PDF/DOC/DOCX) into the club's own folder. Same access rules as the CLUB_*
   * image targets. Rate limited to 20 per minute.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Mutation()
  createDocumentUploadSignature(
    @Context() context: any,
    @Args("target") target: DocumentUploadTarget,
    @Args("clubId", { type: () => ID, nullable: true }) clubId?: string,
  ) {
    const currentUser = this.authService.getUserFromRequest(context?.req);
    if (!currentUser) throw new UnauthorizedException("Authentication required");

    return this.cloudinary.signDocumentUpload(
      target,
      this.clubOwnerId(currentUser, clubId),
    );
  }

  /**
   * Club id whose folder the caller may sign: the club itself (id = user id,
   * `clubId` optional but must match) or, for a super admin, the club it names.
   */
  private clubOwnerId(
    currentUser: { userId: string; role: string },
    clubId?: string,
  ): string {
    if (currentUser.role === "SUPERADMIN") {
      if (!clubId || !SAFE_ID.test(clubId)) {
        throw new BadRequestException("A valid clubId is required for club uploads");
      }
      return clubId;
    }
    if (currentUser.role !== "CLUB" || (clubId && clubId !== currentUser.userId)) {
      throw new ForbiddenException("You are not the admin of this club");
    }
    return currentUser.userId;
  }
}
