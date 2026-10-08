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

    if (currentUser.role === "SUPERADMIN") {
      if (!clubId || !SAFE_ID.test(clubId)) {
        throw new BadRequestException("A valid clubId is required for club images");
      }
      return this.cloudinary.signImageUpload(target, clubId);
    }
    if (
      currentUser.role !== "CLUB" ||
      (clubId && clubId !== currentUser.userId)
    ) {
      throw new ForbiddenException("You are not the admin of this club");
    }
    return this.cloudinary.signImageUpload(target, currentUser.userId);
  }
}
