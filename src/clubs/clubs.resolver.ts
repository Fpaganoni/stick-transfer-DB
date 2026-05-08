import { Resolver, Query, Mutation, Args, ID } from "@nestjs/graphql";
import { ClubsService } from "./clubs.service";
import { NotificationsGateway } from "../notifications/notifications.gateway";
import { CloudinaryService } from "../integrations/cloudinary.service";

@Resolver("Club")
export class ClubsResolver {
  constructor(
    private clubsService: ClubsService,
    private notifications: NotificationsGateway,
    private cloudinary: CloudinaryService,
  ) {}

  @Query()
  clubs() {
    return this.clubsService.findAll();
  }

  @Query("club")
  club(@Args("id") id: string) {
    return this.clubsService.findById(id);
  }

  /** Returns a flat view of every club paired with its CLUB_ADMIN user. */
  @Query()
  clubAdmins() {
    return this.clubsService.getClubAdmins();
  }

  @Mutation()
  async createClub(
    @Args("name") name: string,
    @Args("city") city: string,
    @Args("country") country: string,
    @Args("adminId") adminId: string,
    @Args("location", { nullable: true }) location?: string,
    @Args("benefits", { type: () => [String], nullable: true }) benefits?: string[],
    @Args("instagram", { nullable: true }) instagram?: string,
    @Args("twitter", { nullable: true }) twitter?: string,
    @Args("facebook", { nullable: true }) facebook?: string,
    @Args("tiktok", { nullable: true }) tiktok?: string
  ) {
    return this.clubsService.create({ 
      name, city, country, adminId, location, benefits, 
      instagram, twitter, facebook, tiktok 
    });
  }

  @Mutation()
  async updateClub(
    @Args("id") id: string,
    @Args("name", { nullable: true }) name?: string,
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
  ) {
    return this.clubsService.updateClub(id, {
      name, description, bio, coverImagePosition, league, foundedYear,
      email, phone, website, instagram, twitter, facebook, tiktok, benefits,
    });
  }

  @Mutation()
  async invitePlayerToClub(
    @Args("clubId") clubId: string,
    @Args("userId") userId: string,
    @Args("invitedBy") invitedBy: string
  ) {
    const membership = await this.clubsService.inviteMember(
      clubId,
      userId,
      invitedBy
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
  acceptMembership(@Args("membershipId") membershipId: string) {
    return this.clubsService.acceptMembership(membershipId);
  }

  @Mutation(() => Boolean)
  async uploadClubLogo(
    @Args("clubId", { type: () => ID }) clubId: string,
    @Args("base64") base64: string,
  ) {
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
    @Args("clubId", { type: () => ID }) clubId: string,
    @Args("base64") base64: string,
  ) {
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
    @Args("clubId") clubId: string,
    @Args("documentUrl") documentUrl: string
  ) {
    return this.clubsService.requestVerification(clubId, documentUrl);
  }
}
