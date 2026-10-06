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
import {
  ForbiddenException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { AuthService } from "../auth/auth.service";
import { CloudinaryService } from "../uploads/cloudinary.service";
import { PrismaService } from "../prisma.service";
import { ClubsService } from "../clubs/clubs.service";
import { SocialService } from "../social/social.service";
import { GqlAuthGuard } from "../auth/gql-auth.guard";
import { Throttle } from "@nestjs/throttler";
import { AppError, FieldError } from "../common/errors/app.error";
import { mapUniqueViolation } from "../common/errors/unique-violation";
import {
  checkEmail,
  checkUsername,
  normalizeEmail,
  normalizeUsername,
  validateRegisterCredentials,
  validateUsernameOrThrow,
} from "./validation/credentials";

/**
 * Marks a user object as the caller's own profile when the session cookie was
 * only just issued (register/login), so it is not yet present on the request.
 */
const SELF_VIEW = Symbol("selfView");

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
    return this.authService.getUserFromRequest(context?.req);
  }

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.getCurrentUser(context);
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  /** Caller must be the target user themself or a SUPERADMIN. */
  private requireSelfOrAdmin(
    context: any,
    targetUserId: string,
  ): { userId: string; role: string } {
    const user = this.requireUser(context);
    if (user.userId !== targetUserId && user.role !== "SUPERADMIN") {
      throw new ForbiddenException("You can only modify your own profile");
    }
    return user;
  }

  @Query(() => Boolean)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async isEmailAvailable(@Args("email") email: string) {
    const normalized = normalizeEmail(email);
    const invalid = checkEmail(normalized);
    if (invalid) throw AppError.validation([invalid]);
    return !(await this.usersService.isEmailTaken(normalized));
  }

  @Query(() => Boolean)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async isUsernameAvailable(@Args("username") username: string) {
    const normalized = normalizeUsername(username) ?? "";
    const invalid = checkUsername(normalized);
    if (invalid) throw AppError.validation([invalid]);
    return !(await this.usersService.isUsernameTaken(normalized));
  }

  @Mutation(() => Object)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Context() context: any,
    @Args("email") rawEmail: string,
    @Args("name") rawName: string,
    @Args("username", { nullable: true }) rawUsername?: string,
    @Args("password") rawPassword?: string,
    @Args("role", { nullable: true }) role?: string,
    @Args("country", { nullable: true }) country?: string,
    @Args("city", { nullable: true }) city?: string,
    @Args("position", { nullable: true }) position?: string,
    @Args("dateOfBirth", { nullable: true }) dateOfBirth?: string,
    @Args("clubName", { nullable: true }) clubName?: string,
    @Args("managedByFirstName", { nullable: true }) managedByFirstName?: string,
    @Args("managedByLastName", { nullable: true }) managedByLastName?: string,
  ) {
    // Normalizes (trim/lowercase) and validates email, name, username, password.
    const { email, name, username, password } = validateRegisterCredentials({
      email: rawEmail,
      name: rawName,
      username: rawUsername,
      password: rawPassword,
    });

    // Normalize role to uppercase for case-insensitive validation
    const normalizedRole = role?.toUpperCase();

    const roleErrors: FieldError[] = [];
    // SUPERADMIN cannot self-register
    if (
      normalizedRole &&
      !["PLAYER", "COACH", "CLUB", "UMPIRE"].includes(normalizedRole)
    ) {
      roleErrors.push({
        field: "role",
        code: "ROLE_INVALID",
        message: "Invalid role. Allowed roles: PLAYER, COACH, CLUB, UMPIRE",
      });
    }
    if (normalizedRole === "CLUB") {
      const required: [string, unknown][] = [
        ["clubName", clubName],
        ["country", country],
        ["city", city],
        ["managedByFirstName", managedByFirstName],
        ["managedByLastName", managedByLastName],
      ];
      for (const [field, value] of required) {
        if (!value) {
          roleErrors.push({
            field,
            code: "FIELD_REQUIRED",
            message: `${field} is required when registering as a CLUB`,
          });
        }
      }
    }
    if (roleErrors.length) throw AppError.validation(roleErrors);

    if (await this.usersService.isEmailTaken(email)) throw AppError.emailTaken();
    if (username && (await this.usersService.isUsernameTaken(username))) {
      throw AppError.usernameTaken();
    }

    try {
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
          userId: user.id,
          name: clubName,
          city: city!,
          country: country!,
          managedByFirstName: managedByFirstName!,
          managedByLastName: managedByLastName!,
        });
      }

      const token = await this.authService.login(user);
      this.authService.setAuthCookie(context.res, token.access_token);
      return { ...user, [SELF_VIEW]: true };
    } catch (error) {
      // Race: another request took the email/username after our pre-check.
      throw mapUniqueViolation(error) ?? error;
    }
  }

  @Mutation(() => Object)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Context() context: any,
    @Args("email") email: string,
    @Args("password") password: string,
  ) {
    const user = await this.authService.validateUser(email, password);
    if (!user) throw AppError.invalidCredentials();
    const t = await this.authService.login(user);
    this.authService.setAuthCookie(context.res, t.access_token);
    return { ...user, [SELF_VIEW]: true };
  }

  @Mutation(() => Boolean)
  async logout(@Context() context: any) {
    this.authService.clearAuthCookie(context.res);
    return true;
  }

  @Mutation(() => Boolean)
  async uploadAvatar(
    @Context() context: any,
    @Args("userId", { type: () => ID }) userId: string,
    @Args("base64") base64: string,
  ) {
    this.requireSelfOrAdmin(context, userId);
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
    @Context() context: any,
    @Args("userId", { type: () => ID }) userId: string,
    @Args("base64") base64: string,
  ) {
    this.requireSelfOrAdmin(context, userId);
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
    @Context() context: any,
    @Args("userId", { type: () => ID }) userId: string,
    @Args("base64") base64: string,
  ) {
    this.requireSelfOrAdmin(context, userId);
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error("User not found");
    if (
      user.role !== "PLAYER" &&
      user.role !== "COACH" &&
      user.role !== "UMPIRE"
    ) {
      throw new Error(
        "CV upload is only available for PLAYER, COACH and UMPIRE roles",
      );
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
  async deleteCV(
    @Context() context: any,
    @Args("userId", { type: () => ID }) userId: string,
  ) {
    this.requireSelfOrAdmin(context, userId);
    const user = await this.usersService.findById(userId);
    if (!user) throw new Error("User not found");
    await this.usersService.deleteCv(userId);
    return true;
  }

  @UseGuards(GqlAuthGuard)
  @Query(() => Object)
  async me(@Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) throw new Error("Unauthenticated");
    return this.usersService.findById(currentUser.userId);
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

  @Query(() => [Object])
  async umpires() {
    return this.usersService.findByRole("UMPIRE");
  }

  @Mutation(() => Object)
  async updateUser(
    @Context() context: any,
    @Args("id") id: string,
    @Args("name", { nullable: true }) name?: string,
    @Args("username", { nullable: true }) rawUsername?: string,
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
    @Args("licenseLevel", { nullable: true }) licenseLevel?: string,
    @Args("certifyingBody", { nullable: true }) certifyingBody?: string,
    @Args("licenseNumber", { nullable: true }) licenseNumber?: string,
    @Args("certificationYear", { nullable: true }) certificationYear?: number,
    @Args("matchesOfficiated", { nullable: true }) matchesOfficiated?: number,
    @Args("travelAvailability", { nullable: true }) travelAvailability?: string,
    @Args("languages", { type: () => [String], nullable: true })
    languages?: string[],
    @Args("modalities", { type: () => [String], nullable: true })
    modalities?: string[],
    @Args("umpireCategories", { type: () => [String], nullable: true })
    umpireCategories?: string[],
    @Args("umpireCertifications", { type: () => [Object], nullable: true })
    umpireCertifications?: any[],
  ) {
    const currentUser = this.requireSelfOrAdmin(context, id);
    const username = validateUsernameOrThrow(rawUsername);

    // Joining a club requires an accepted invitation; only admins can force it.
    if (clubId && currentUser.role !== "SUPERADMIN") {
      await this.usersService.assertActiveClubMember(id, clubId);
    }

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
        licenseLevel,
        certifyingBody,
        licenseNumber,
        certificationYear,
        matchesOfficiated,
        travelAvailability,
        languages,
        modalities,
        umpireCategories,
        umpireCertifications,
      });
    } catch (error) {
      throw mapUniqueViolation(error) ?? error;
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
  async umpireCertifications(@Parent() user: any) {
    return this.prisma.umpireCertification.findMany({
      where: { userId: user.id },
      orderBy: { order: "asc" },
    });
  }

  /** Private fields are visible only to the owner and super admins. */
  private canSeePrivateFields(user: any, context: any): boolean {
    if (user?.[SELF_VIEW]) return true;
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return currentUser.userId === user.id || currentUser.role === "SUPERADMIN";
  }

  /** PRIVACY: email is visible only to the owner and super admins. */
  @ResolveField()
  async email(@Parent() user: any, @Context() context: any) {
    return this.canSeePrivateFields(user, context) ? user.email : null;
  }

  /** PRIVACY: license number is visible only to the owner and super admins. */
  @ResolveField()
  async licenseNumber(@Parent() user: any, @Context() context: any) {
    return this.canSeePrivateFields(user, context)
      ? (user.licenseNumber ?? null)
      : null;
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
  async followers(@Parent() user: any) {
    return this.socialService.getFollowers("USER", user.id);
  }

  @ResolveField()
  async following(@Parent() user: any) {
    return this.socialService.getFollowing("USER", user.id);
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
