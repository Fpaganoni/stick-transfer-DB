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
  NotFoundException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { AuthService } from "../auth/auth.service";
import { CloudinaryService } from "../uploads/cloudinary.service";
import { assertImageDataUrl } from "../uploads/image-url";
import { PrismaService } from "../prisma.service";
import { ClubsService } from "../clubs/clubs.service";
import { SocialService } from "../social/social.service";
import { GqlAuthGuard } from "../auth/gql-auth.guard";
import { Throttle } from "@nestjs/throttler";
import { AppError, FieldError } from "../common/errors/app.error";
import { mapUniqueViolation } from "../common/errors/unique-violation";
import { checkCountry, normalizeCountry } from "../common/geo/countries";
import { SELF_VIEW } from "../common/self-view";
import { checkClubName } from "../clubs/club-name";
import { checkManagerName } from "../clubs/clubs.service";
import { checkClubForbiddenFields } from "./validation/club-person-fields";
import {
  checkDateOfBirth,
  checkEmail,
  checkName,
  checkRegisterCredentials,
  checkUsername,
  normalizeEmail,
  normalizeUsername,
  resolvePosition,
  validateUsernameOrThrow,
} from "./validation/credentials";

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
  async isUsernameAvailable(
    @Context() context: any,
    @Args("username") username: string,
  ) {
    const normalized = normalizeUsername(username) ?? "";
    const invalid = checkUsername(normalized);
    if (invalid) throw AppError.validation([invalid]);
    // The profile form validates the username on edit: your own is available to you.
    const currentUser = this.getCurrentUser(context);
    return !(await this.usersService.isUsernameTaken(normalized, currentUser?.userId));
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
    // Normalize role to uppercase for case-insensitive validation
    // A blank role means "not provided" (defaults to PLAYER), not an unknown role.
    const normalizedRole = role?.trim().toUpperCase() || undefined;
    const isClub = normalizedRole === "CLUB";

    // Normalizes (trim/lowercase) and validates email, name, username, password
    // and dateOfBirth. Errors are merged with the role/position ones below so the
    // client gets a single VALIDATION_ERROR. A CLUB account IS the club, so its
    // name is clubName and the `name` argument is ignored; its dateOfBirth and
    // position are FIELD_NOT_ALLOWED (a club is not a person).
    const { values, errors: credentialErrors } = checkRegisterCredentials({
      email: rawEmail,
      name: isClub ? (clubName ?? "") : rawName,
      username: rawUsername,
      password: rawPassword,
      dateOfBirth: isClub ? undefined : dateOfBirth,
    });
    const { email, username, password } = values;
    let name = values.name;
    // For a CLUB, name problems belong to clubName (a missing one is FIELD_REQUIRED below).
    const roleErrors: FieldError[] = isClub
      ? credentialErrors.filter((e) => e.field !== "name")
      : [...credentialErrors];
    if (isClub) {
      roleErrors.push(...checkClubForbiddenFields({ dateOfBirth, position }));
      if (clubName?.trim()) {
        const checked = checkClubName(clubName, "clubName");
        if (checked.error) roleErrors.push(checked.error);
        else name = checked.name;
      }
    }
    if (isClub) {
      for (const [field, value] of [
        ["managedByFirstName", managedByFirstName],
        ["managedByLastName", managedByLastName],
      ] as const) {
        // A missing value is reported as FIELD_REQUIRED below; check only what was sent.
        const managerError = value?.trim() ? checkManagerName(field, value) : null;
        if (managerError) roleErrors.push(managerError);
      }
    }

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
    if (isClub) {
      const required: [string, unknown][] = [
        ["clubName", clubName],
        ["country", country],
        ["city", city],
        ["managedByFirstName", managedByFirstName],
        ["managedByLastName", managedByLastName],
      ];
      for (const [field, value] of required) {
        if (typeof value !== "string" || !value.trim()) {
          roleErrors.push({
            field,
            code: "FIELD_REQUIRED",
            message: `${field} is required when registering as a CLUB`,
          });
        }
      }
    }
    // Only PLAYER stores a position (role defaults to PLAYER). With an invalid
    // role we skip the check; ROLE_INVALID is already reported.
    const roleIsValid = !roleErrors.some((e) => e.field === "role");
    const resolvedPosition = roleIsValid
      ? resolvePosition(normalizedRole ?? "PLAYER", position)
      : { position: undefined, error: null };
    if (resolvedPosition.error) roleErrors.push(resolvedPosition.error);
    // A missing CLUB country is already FIELD_REQUIRED; only check what was sent.
    const countryError = country ? checkCountry(country) : null;
    if (countryError) roleErrors.push(countryError);
    if (roleErrors.length) throw AppError.validation(roleErrors);
    const countryCode = normalizeCountry(country) ?? undefined;

    if (await this.usersService.isEmailTaken(email)) throw AppError.emailTaken();
    if (username && (await this.usersService.isUsernameTaken(username))) {
      throw AppError.usernameTaken();
    }
    if (isClub) await this.clubsService.assertClubNameAvailable(name, null, "clubName");

    try {
      // A CLUB user and its Club row are created in ONE write (nested create):
      // a failure never leaves an orphan CLUB account.
      const user = await this.usersService.createUser({
        email,
        name,
        username,
        password,
        role: normalizedRole,
        country: countryCode,
        city: isClub ? city!.trim() : city,
        position: resolvedPosition.position,
        dateOfBirth,
        clubProfile: isClub
          ? {
              managedByFirstName: managedByFirstName!.trim(),
              managedByLastName: managedByLastName!.trim(),
            }
          : undefined,
      });
      if (isClub) await this.clubsService.notifyPendingVerification(user.id);

      const token = await this.authService.login(user);
      this.authService.setAuthCookie(context.res, token.access_token);
      return { ...user, [SELF_VIEW]: true };
    } catch (error) {
      // Race: another request took the email/username/club name after our pre-check.
      throw mapUniqueViolation(error, { clubNameField: "clubName" }) ?? error;
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
    // Clearing the cookie only logs this browser out; a stolen copy of the token
    // would live on. Bumping tokenVersion kills it everywhere (all devices).
    const currentUser = this.getCurrentUser(context);
    if (currentUser) await this.authService.revokeSessions(currentUser.userId);
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
    assertImageDataUrl("avatar", base64);
    try {
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
    assertImageDataUrl("coverImage", base64);
    try {
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
    // A club is not a person: same FIELD_NOT_ALLOWED as updateUser's cvUrl.
    if (user.role === "CLUB") {
      throw AppError.validation(checkClubForbiddenFields({ cvUrl: base64 }));
    }
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
  async users(
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.usersService.findAll(limit, offset);
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
  async players(
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.usersService.findByRole("PLAYER", limit, offset);
  }

  @Query(() => [Object])
  async coaches(
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.usersService.findByRole("COACH", limit, offset);
  }

  @Query(() => [Object])
  async umpires(
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.usersService.findByRole("UMPIRE", limit, offset);
  }

  @Mutation(() => Object)
  async updateUser(
    @Context() context: any,
    @Args("id") id: string,
    @Args("name", { nullable: true }) name?: string,
    @Args("username", { nullable: true }) rawUsername?: string,
    @Args("bio", { nullable: true }) bio?: string,
    @Args("avatar", { nullable: true }) avatar?: string | null,
    @Args("coverImage", { nullable: true }) coverImage?: string | null,
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

    const profileErrors: FieldError[] = [];
    const dateOfBirthError = checkDateOfBirth(dateOfBirth);
    if (dateOfBirthError) profileErrors.push(dateOfBirthError);
    // undefined = untouched, null = clear, anything else must be a country code
    const countryError = checkCountry(country);
    if (countryError) profileErrors.push(countryError);
    const nameError = name !== undefined ? checkName(name) : null;
    if (nameError) profileErrors.push(nameError);

    // position (PLAYER only), multimedia (never UMPIRE), the person fields (never
    // CLUB) and the club identity rules are judged by the stored role, not the
    // caller's (an admin may edit someone else). Skip the lookup when none of
    // them is sent.
    const personFields = {
      dateOfBirth,
      cvUrl,
      position,
      yearsOfExperience,
      level,
      trajectories,
      multimedia,
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
    };
    const forbiddenForClub = checkClubForbiddenFields(personFields);
    let resolvedPosition: string | null | undefined;
    let clubIdentityTarget = false;
    if (
      forbiddenForClub.length ||
      name !== undefined ||
      city !== undefined ||
      country !== undefined
    ) {
      const target = await this.usersService.findById(id);
      if (!target) throw new NotFoundException("User not found");
      clubIdentityTarget = target.role === "CLUB";
      if (clubIdentityTarget) profileErrors.push(...forbiddenForClub);
      if (position !== undefined) {
        const result = resolvePosition(target.role, position);
        if (result.error) profileErrors.push(result.error);
        resolvedPosition = result.position;
      }
      if (multimedia !== undefined && target.role === "UMPIRE") {
        profileErrors.push({
          field: "multimedia",
          code: "FIELD_NOT_ALLOWED",
          message: "Umpire profiles cannot have multimedia",
        });
      }
    }
    // For a CLUB, FIELD_NOT_ALLOWED replaces the format error of the same field.
    const reportedErrors = clubIdentityTarget
      ? profileErrors.filter((e) => e.field !== "dateOfBirth" || e.code === "FIELD_NOT_ALLOWED")
      : profileErrors;
    if (reportedErrors.length) throw AppError.validation(reportedErrors);

    // A CLUB account IS the club: the same rule as updateClub (unique club name,
    // a city and a country are required) through ONE shared service method.
    const clubIdentity = clubIdentityTarget
      ? await this.clubsService.assertClubIdentityUpdate(id, { name, city, country })
      : undefined;

    // Joining a club requires an accepted invitation; only admins can force it.
    if (clubId && currentUser.role !== "SUPERADMIN") {
      await this.usersService.assertActiveClubMember(id, clubId);
    }

    try {
      const updated = await this.usersService.updateUser(id, {
        name: clubIdentity?.name ?? name?.trim(),
        username,
        bio,
        avatar,
        coverImage,
        coverImagePosition,
        position: resolvedPosition,
        country: clubIdentity?.country ?? (country == null ? country : normalizeCountry(country)),
        city: clubIdentity?.city ?? city,
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
      this.clubsService.resetLoaders(context);
      return updated;
    } catch (error) {
      throw mapUniqueViolation(error) ?? error;
    }
  }

  /**
   * The club data of a CLUB account (null for every other role), so `me` and
   * getUserByUsername return identity + club in one request. Batched per request.
   */
  @ResolveField()
  async clubProfile(@Parent() user: any, @Context() context: any) {
    if (user.role !== "CLUB") return null;
    const club = await this.clubsService.loadClubProfile(context, user.id);
    // Carry the "just registered/logged in" marker so managedBy is visible to its owner.
    return club && user[SELF_VIEW] ? { ...club, [SELF_VIEW]: true } : club;
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

  /** UMPIRE profiles have no multimedia; NULL (legacy rows) reads as []. */
  @ResolveField()
  multimedia(@Parent() user: any): string[] {
    if (user.role === "UMPIRE") return [];
    return user.multimedia ?? [];
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

  /**
   * PRIVACY: date of birth is visible only to the owner and super admins (it
   * identifies minors aged 16-17). Rendered as YYYY-MM-DD, the format the
   * register and updateUser inputs use.
   */
  @ResolveField()
  async dateOfBirth(@Parent() user: any, @Context() context: any) {
    if (!this.canSeePrivateFields(user, context) || !user.dateOfBirth) return null;
    const value = user.dateOfBirth;
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  }

  /** PRIVACY: license number is visible only to the owner and super admins. */
  @ResolveField()
  async licenseNumber(@Parent() user: any, @Context() context: any) {
    return this.canSeePrivateFields(user, context)
      ? (user.licenseNumber ?? null)
      : null;
  }

  // followersCount and isFollowedByCurrentUser are batched
  // per request (see SocialLoaders): a list of N users costs one query per
  // selected field, not N.
  /**
   * A CLUB account lives only on the CLUB social axis, so its counters and lists
   * are the very same ones Club.followersCount and friends read.
   */
  private socialAxis(user: { role?: string }): "USER" | "CLUB" {
    return user.role === "CLUB" ? "CLUB" : "USER";
  }

  @ResolveField()
  async followersCount(@Parent() user: any, @Context() context: any) {
    return this.socialService.loadFollowersCount(context, this.socialAxis(user), user.id);
  }

  @ResolveField()
  async followingCount(@Parent() user: any) {
    return this.socialService.countFollowing(this.socialAxis(user), user.id);
  }

  @ResolveField()
  async followers(
    @Parent() user: any,
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.socialService.getFollowers(this.socialAxis(user), user.id, { limit, offset });
  }

  @ResolveField()
  async following(
    @Parent() user: any,
    @Args("limit", { nullable: true }) limit?: number,
    @Args("offset", { nullable: true }) offset?: number,
  ) {
    return this.socialService.getFollowing(this.socialAxis(user), user.id, { limit, offset });
  }

  @ResolveField()
  async isFollowedByCurrentUser(@Parent() user: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.socialService.loadIsFollowing(
      context,
      currentUser.userId,
      this.socialAxis(user),
      user.id,
    );
  }
}
