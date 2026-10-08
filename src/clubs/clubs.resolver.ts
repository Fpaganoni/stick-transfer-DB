import { Resolver, Query, Mutation, Args, Context, ResolveField, Parent, ID } from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ClubsService } from "./clubs.service";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { CloudinaryService } from "../uploads/cloudinary.service";
import { assertImageDataUrl } from "../uploads/image-url";
import { AuthService } from "../auth/auth.service";
import { SocialService } from "../social/social.service";

@Resolver("Club")
export class ClubsResolver {
  constructor(
    private clubsService: ClubsService,
    private notifications: NotificationsGateway,
    private cloudinary: CloudinaryService,
    private authService: AuthService,
    private socialService: SocialService,
  ) {}

  private getCurrentUser(context: any): { userId: string; role: string } | null {
    return this.authService.getUserFromRequest(context?.req);
  }

  private requireSuperAdmin(context: any): { userId: string; role: string } {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) throw new UnauthorizedException("Authentication required");
    if (currentUser.role !== "SUPERADMIN") {
      throw new ForbiddenException("Super admin access required");
    }
    return currentUser;
  }

  private requireUser(context: any): { userId: string; role: string } {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) throw new UnauthorizedException("Authentication required");
    return currentUser;
  }

  /** Club.id === owning User.id, so the club admin is the user with that id. */
  private requireClubOwnerOrAdmin(
    context: any,
    clubId: string,
  ): { userId: string; role: string } {
    const currentUser = this.requireUser(context);
    if (currentUser.userId !== clubId && currentUser.role !== "SUPERADMIN") {
      throw new ForbiddenException("You are not the admin of this club");
    }
    return currentUser;
  }

  @Query()
  clubs() {
    return this.clubsService.findAll();
  }

  @Query("club")
  club(@Args("id") id: string) {
    return this.clubsService.findById(id);
  }

  /** Returns a flat view of every club paired with its CLUB user. */
  @Query()
  clubAdmins(@Context() context: any) {
    this.requireSuperAdmin(context);
    return this.clubsService.getClubAdmins();
  }

  @Mutation()
  async createClub(
    @Context() context: any,
    @Args("name") name: string,
    @Args("city") city: string,
    @Args("country") country: string,
    @Args("managedByFirstName") managedByFirstName: string,
    @Args("managedByLastName") managedByLastName: string,
    @Args("location", { nullable: true }) location?: string,
    @Args("benefits", { type: () => [String], nullable: true }) benefits?: string[],
    @Args("instagram", { nullable: true }) instagram?: string,
    @Args("twitter", { nullable: true }) twitter?: string,
    @Args("facebook", { nullable: true }) facebook?: string,
    @Args("tiktok", { nullable: true }) tiktok?: string
  ) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) throw new UnauthorizedException("Authentication required");

    return this.clubsService.create({
      userId: currentUser.userId,
      name, city, country, managedByFirstName, managedByLastName, benefits,
      instagram, twitter, facebook, tiktok
    });
  }

  /** Super-admin only: approves a club's verification request. */
  @Mutation()
  async verifyClub(@Context() context: any, @Args("clubId") clubId: string) {
    const currentUser = this.requireSuperAdmin(context);
    return this.clubsService.verifyClub(clubId, currentUser.userId);
  }

  /** Super-admin only: sets a club's verification status directly. */
  @Mutation()
  async adminSetClubVerification(
    @Context() context: any,
    @Args("clubId") clubId: string,
    @Args("status") status: string,
  ) {
    const currentUser = this.requireSuperAdmin(context);
    return this.clubsService.setVerificationStatus(clubId, status, currentUser.userId);
  }

  @Mutation()
  async updateClub(
    @Context() context: any,
    @Args("id") id: string,
    @Args("name", { nullable: true }) name?: string,
    @Args("managedByFirstName", { nullable: true }) managedByFirstName?: string,
    @Args("managedByLastName", { nullable: true }) managedByLastName?: string,
    @Args("description", { nullable: true }) description?: string,
    @Args("bio", { nullable: true }) bio?: string,
    @Args("coverImagePosition", { nullable: true }) coverImagePosition?: string,
    @Args("league", { nullable: true }) league?: string,
    @Args("foundedYear", { nullable: true }) foundedYear?: number,
    @Args("email", { nullable: true }) email?: string,
    @Args("phone", { nullable: true }) phone?: string,
    @Args("website", { nullable: true }) website?: string,
    @Args("instagram", { nullable: true }) instagram?: string,
    @Args("twitter", { nullable: true }) twitter?: string,
    @Args("facebook", { nullable: true }) facebook?: string,
    @Args("tiktok", { nullable: true }) tiktok?: string,
    @Args("benefits", { type: () => [String], nullable: true }) benefits?: string[],
    @Args("logo", { nullable: true }) logo?: string | null,
    @Args("coverImage", { nullable: true }) coverImage?: string | null,
    @Args("city", { nullable: true }) city?: string | null,
    @Args("country", { nullable: true }) country?: string | null,
  ) {
    this.requireClubOwnerOrAdmin(context, id);
    return this.clubsService.updateClub(id, {
      name, managedByFirstName, managedByLastName, description, bio, coverImagePosition, league, foundedYear,
      email, phone, website, instagram, twitter, facebook, tiktok, benefits,
      logo, coverImage, city, country,
    });
  }

  @ResolveField()
  managedBy(@Parent() club: any) {
    return { firstName: club.managedByFirstName, lastName: club.managedByLastName };
  }

  @Mutation()
  async invitePlayerToClub(
    @Context() context: any,
    @Args("clubId") clubId: string,
    @Args("userId") userId: string,
    @Args("invitedBy", { nullable: true }) invitedBy?: string
  ) {
    const currentUser = this.requireClubOwnerOrAdmin(context, clubId);
    // Legacy clients still send invitedBy; the inviter is the session user.
    if (invitedBy && invitedBy !== currentUser.userId) {
      throw new ForbiddenException("You can only invite on behalf of yourself");
    }
    const membership = await this.clubsService.inviteMember(
      clubId,
      userId,
      currentUser.userId
    );
    this.notifications.sendNotification(userId, {
      type: "INVITE",
      clubId,
      membershipId: membership.id,
      message: `You were invited to join club ${clubId}`,
    });
    return membership;
  }

  @Mutation()
  acceptMembership(
    @Context() context: any,
    @Args("membershipId") membershipId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.clubsService.acceptMembership(membershipId, currentUser.userId);
  }

  @Mutation(() => Boolean)
  async uploadClubLogo(
    @Context() context: any,
    @Args("clubId", { type: () => ID }) clubId: string,
    @Args("base64") base64: string,
  ) {
    this.requireClubOwnerOrAdmin(context, clubId);
    assertImageDataUrl("logo", base64);
    try {
      const res = await this.cloudinary.uploadBase64(base64, "club_logos");
      await this.clubsService.setLogo(clubId, res.secure_url || res.url);
      return true;
    } catch (error) {
      throw new Error(`Failed to upload club logo: ${error.message}`);
    }
  }

  @Mutation(() => Boolean)
  async uploadClubCoverImage(
    @Context() context: any,
    @Args("clubId", { type: () => ID }) clubId: string,
    @Args("base64") base64: string,
  ) {
    this.requireClubOwnerOrAdmin(context, clubId);
    assertImageDataUrl("coverImage", base64);
    try {
      const res = await this.cloudinary.uploadBase64(base64, "club_covers");
      await this.clubsService.setCoverImage(clubId, res.secure_url || res.url);
      return true;
    } catch (error) {
      throw new Error(`Failed to upload club cover image: ${error.message}`);
    }
  }

  @Mutation()
  requestClubVerification(
    @Context() context: any,
    @Args("clubId") clubId: string,
    @Args("documentUrl") documentUrl: string
  ) {
    this.requireClubOwnerOrAdmin(context, clubId);
    return this.clubsService.requestVerification(clubId, documentUrl);
  }

  @ResolveField()
  async followersCount(@Parent() club: any) {
    return this.socialService.countFollowers("CLUB", club.id);
  }

  @ResolveField()
  async likesReceivedCount(@Parent() club: any) {
    return this.socialService.countLikesReceived("CLUB", club.id);
  }

  @ResolveField()
  async isFollowedByCurrentUser(@Parent() club: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.socialService.isFollowing("USER", currentUser.userId, "CLUB", club.id);
  }

  @ResolveField()
  async isLikedByCurrentUser(@Parent() club: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.socialService.hasLiked("USER", currentUser.userId, "CLUB", club.id);
  }
}
