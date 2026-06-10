import {
  Resolver,
  Mutation,
  Args,
  Query,
  Context,
  ResolveField,
  Parent,
  ID,
} from "@nestjs/graphql";
import { BadRequestException } from "@nestjs/common";
import { UsersService } from "./users.service";
import { AuthService } from "../auth/auth.service";
import { CloudinaryService } from "../uploads/cloudinary.service";
import { PrismaService } from "../prisma.service";
import { ClubsService } from "../clubs/clubs.service";
import { SocialService } from "../social/social.service";

@Resolver("User")
export class UsersResolver {
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private cloudinary: CloudinaryService,
    private prisma: PrismaService,
    private clubsService: ClubsService,
    private socialService: SocialService,
  ) {}

  private getCurrentUser(context: any): { userId: string; role: string } | null {
    return this.authService.getUserFromAuthHeader(
      context?.req?.headers?.authorization,
    );
  }

  @Mutation(() => String)
  async register(
    @Args("email") email: string,
    @Args("name") name: string,
    @Args("username", { nullable: true }) username?: string,
    @Args("password") password?: string,
    @Args("role", { nullable: true }) role?: string,
    @Args("country", { nullable: true }) country?: string,
    @Args("city", { nullable: true }) city?: string,
    @Args("position", { nullable: true }) position?: string,
    @Args("dateOfBirth", { nullable: true }) dateOfBirth?: string,
    @Args("clubName", { nullable: true }) clubName?: string,
  ) {
    try {
      // Normalize role to uppercase for case-insensitive validation
      const normalizedRole = role?.toUpperCase();

      // Validate role if provided — SUPERADMIN cannot self-register
      if (
        normalizedRole &&
        !["PLAYER", "COACH", "CLUB"].includes(normalizedRole)
      ) {
        throw new BadRequestException(
          "Invalid role. Allowed roles: PLAYER, COACH, CLUB",
        );
      }

      if (normalizedRole === "CLUB") {
        if (!clubName) {
          throw new BadRequestException("clubName is required when registering as a CLUB");
        }
        if (!country || !city) {
          throw new BadRequestException("country and city are required when registering as a CLUB");
        }
      }

      const user = await this.usersService.createUser({
        email,
        name,
        username,
        password,
        role: normalizedRole,
        country,
        city,
        position,
        dateOfBirth,
      });

      if (normalizedRole === "CLUB" && clubName) {
        await this.clubsService.create({
          name: clubName,
          city: city!,
          country: country!,
          adminId: user.id,
        });
      }

      const token = await this.authService.login(user);
      return token.access_token;
    } catch (error) {
      if (error.code === "P2002") {
        throw new BadRequestException(`${error.meta.target[0]} already exists`);
      }
      throw error;
    }
  }

  @Mutation(() => String)
  async login(
    @Args("email") email: string,
    @Args("password") password: string,
  ) {
    const user = await this.authService.validateUser(email, password);
    if (!user) throw new Error("Invalid credentials");
    const t = await this.authService.login(user);
    return t.access_token;
  }

  @Mutation(() => Boolean)
  async uploadAvatar(
    @Args("userId", { type: () => ID }) userId: string,
    @Args("base64") base64: string,
  ) {
    try {
      // accepts a data-url or base64 string
      const res = await this.cloudinary.uploadBase64(base64, "avatars");
      await this.usersService.setAvatar(userId, res.secure_url || res.url);
      return true;
    } catch (error) {
      throw new Error(`Failed to upload avatar: ${error.message}`);
    }
  }

  @Mutation(() => Boolean)
  async uploadCoverImage(
    @Args("userId", { type: () => ID }) userId: string,
    @Args("base64") base64: string,
  ) {
    try {
      // accepts a data-url or base64 string
      const res = await this.cloudinary.uploadBase64(base64, "covers");
      await this.usersService.setCoverImage(userId, res.secure_url || res.url);
      return true;
    } catch (error) {
      throw new Error(`Failed to upload cover image: ${error.message}`);
    }
  }

  @Mutation(() => String)
  async uploadCV(
    @Args("userId", { type: () => ID }) userId: string,
    @Args("base64") base64: string,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error("User not found");
    if (user.role !== "PLAYER" && user.role !== "COACH") {
      throw new Error("CV upload is only available for PLAYER and COACH roles");
    }
    if (!base64.startsWith("data:application/pdf;base64,")) {
      throw new Error("Invalid file format. Only PDF files are allowed.");
    }
    try {
      const res = await this.cloudinary.uploadPdf(base64, "stick-transfer/cvs");
      const url = res.secure_url || res.url;
      await this.usersService.setCv(userId, url);
      return url;
    } catch (error) {
      throw new Error(`Failed to upload CV: ${error.message}`);
    }
  }

  @Mutation(() => Boolean)
  async deleteCV(@Args("userId", { type: () => ID }) userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error("User not found");
    await this.usersService.deleteCv(userId);
    return true;
  }

  @Query(() => Object)
  async me(@Args("id", { type: () => ID }) id: string) {
    return this.usersService.findById(id);
  }

  @Query(() => [Object])
  async users() {
    return this.usersService.findAll();
  }

  @Query(() => Object, { nullable: true })
  async user(@Args("id", { type: () => ID }) id: string) {
    return this.usersService.findById(id);
  }

  @Query(() => Object, { nullable: true })
  async getUserByUsername(@Args("username") username: string) {
    return this.usersService.findByUsername(username);
  }

  @Query(() => [Object])
  async players() {
    return this.usersService.findByRole("PLAYER");
  }

  @Query(() => [Object])
  async coaches() {
    return this.usersService.findByRole("COACH");
  }

  @Mutation(() => Object)
  async updateUser(
    @Args("id") id: string,
    @Args("name", { nullable: true }) name?: string,
    @Args("username", { nullable: true }) username?: string,
    @Args("bio", { nullable: true }) bio?: string,
    @Args("avatar", { nullable: true }) avatar?: string,
    @Args("coverImage", { nullable: true }) coverImage?: string,
    @Args("coverImagePosition", { nullable: true }) coverImagePosition?: string,
    @Args("position", { nullable: true }) position?: string,
    @Args("country", { nullable: true }) country?: string,
    @Args("city", { nullable: true }) city?: string,
    @Args("clubId", { nullable: true }) clubId?: string,
    @Args("yearsOfExperience", { nullable: true }) yearsOfExperience?: number,
    @Args("multimedia", { type: () => [String], nullable: true })
    multimedia?: string[],
    @Args("cvUrl", { nullable: true }) cvUrl?: string,
    @Args("dateOfBirth", { nullable: true }) dateOfBirth?: string,
    @Args("level", { nullable: true }) level?: string,
    @Args("trajectories", { type: () => [Object], nullable: true })
    trajectories?: any[],
  ) {
    try {
      return await this.usersService.updateUser(id, {
        name,
        username,
        bio,
        avatar,
        coverImage,
        coverImagePosition,
        position,
        country,
        city,
        clubId,
        yearsOfExperience,
        multimedia,
        cvUrl,
        dateOfBirth,
        level,
        trajectories,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new BadRequestException(`${error.meta.target[0]} already exists`);
      }
      throw error;
    }
  }

  // Field resolver for trajectories
  @ResolveField()
  async trajectories(@Parent() user: any) {
    const { id } = user;
    return this.prisma.trajectory.findMany({
      where: { userId: id },
      include: { club: true },
      orderBy: { order: "asc" },
    });
  }

  @ResolveField()
  async followersCount(@Parent() user: any) {
    return this.socialService.countFollowers("USER", user.id);
  }

  @ResolveField()
  async followingCount(@Parent() user: any) {
    return this.socialService.countFollowing("USER", user.id);
  }

  @ResolveField()
  async likesReceivedCount(@Parent() user: any) {
    return this.socialService.countLikesReceived("USER", user.id);
  }

  @ResolveField()
  async isFollowedByCurrentUser(@Parent() user: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.socialService.isFollowing("USER", currentUser.userId, "USER", user.id);
  }

  @ResolveField()
  async isLikedByCurrentUser(@Parent() user: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.socialService.hasLiked("USER", currentUser.userId, "USER", user.id);
  }
}
