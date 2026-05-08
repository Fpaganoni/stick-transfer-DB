import {
  Resolver,
  Mutation,
  Args,
  Query,
  ResolveField,
  Parent,
  ID,
} from "@nestjs/graphql";
import { UsersService } from "./users.service";
import { AuthService } from "../auth/auth.service";
import { CloudinaryService } from "../integrations/cloudinary.service";
import { PrismaService } from "../prisma.service";

@Resolver("User")
export class UsersResolver {
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
    private cloudinary: CloudinaryService,
    private prisma: PrismaService,
  ) {}

  @Mutation(() => String)
  async register(
    @Args("email") email: string,
    @Args("name") name: string,
    @Args("username", { nullable: true }) username?: string,
    @Args("password") password?: string,
    @Args("role", { nullable: true }) role?: string,
  ) {
    try {
      // Normalize role to uppercase for case-insensitive validation
      const normalizedRole = role?.toUpperCase();

      // Validate role if provided
      if (
        normalizedRole &&
        !["PLAYER", "COACH", "CLUB_ADMIN"].includes(normalizedRole)
      ) {
        throw new Error(
          "Invalid role. Allowed roles: PLAYER, COACH, CLUB_ADMIN",
        );
      }

      const user = await this.usersService.createUser({
        email,
        name,
        username,
        password,
        role: normalizedRole,
      });
      const token = await this.authService.login(user);
      return token.access_token;
    } catch (error) {
      if (error.code === "P2002") {
        throw new Error(`${error.meta.target[0]} already exists`);
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
      const res = await this.cloudinary.uploadPdf(base64, "cvs");
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
    @Args("multimedia", { type: () => [String], nullable: true }) multimedia?: string[],
    @Args("cvUrl", { nullable: true }) cvUrl?: string,
    @Args("statistics", { nullable: true }) statistics?: any,
    @Args("trajectories", { type: () => [Object], nullable: true }) trajectories?: any[],
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
        statistics,
        trajectories,
      });
    } catch (error) {
      if (error.code === "P2002") {
        throw new Error(`${error.meta.target[0]} already exists`);
      }
      throw error;
    }
  }

  // Field resolver for statistics - returns aggregated career stats
  @ResolveField()
  async statistics(@Parent() user: any) {
    const { id } = user;

    // Get the "Career" statistics record which contains aggregated totals
    const careerStats = await this.prisma.statistics.findFirst({
      where: {
        userId: id,
        season: "Career",
      },
      include: { club: true },
    });

    return careerStats;
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

  // Field resolver for level - computed from yearsOfExperience
  // PROFESSIONAL: >= 5 years | AMATEUR: < 5 years or not set
  @ResolveField()
  async level(@Parent() user: any) {
    const { yearsOfExperience } = user;
    return yearsOfExperience != null && yearsOfExperience >= 5
      ? "PROFESSIONAL"
      : "AMATEUR";
  }
}
