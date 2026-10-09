import {
  Resolver,
  Query,
  Mutation,
  Args,
  Context,
  ResolveField,
  Parent,
  ID,
} from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsLoaders } from "./jobs.loaders";
import { AuthService } from "../auth/auth.service";

@Resolver("JobOpportunity")
export class JobsResolver {
  constructor(
    private jobsService: JobsService,
    private authService: AuthService,
    private jobsLoaders: JobsLoaders,
  ) {}

  private getCurrentUser(context: any): { userId: string; role: string } | null {
    return this.authService.getUserFromRequest(context?.req);
  }

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.getCurrentUser(context);
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  /**
   * Legacy clients still send their own userId; identity now comes from the
   * session, so a client-supplied id is only accepted when it matches.
   */
  private assertSameUserIfProvided(
    currentUser: { userId: string },
    claimedUserId?: string,
  ) {
    if (claimedUserId && claimedUserId !== currentUser.userId) {
      throw new ForbiddenException("You can only act on behalf of yourself");
    }
  }

  /** Runs a mutation that changes saved/applied state, then drops the request's loader cache (even on failure). */
  private async resettingLoaders<T>(context: any, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } finally {
      this.jobsLoaders.reset(context);
    }
  }

  // Optional auth, false for anonymous. Both fields go through per-request
  // loaders: one query per request no matter how many jobs the response lists.
  @ResolveField()
  async isSavedByCurrentUser(@Parent() job: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.jobsLoaders.forContext(context, currentUser.userId).isSaved.load(job.id);
  }

  // WITHDRAWN applications do not count (see JobsService.findAppliedJobIds)
  @ResolveField()
  async hasAppliedByCurrentUser(@Parent() job: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.jobsLoaders.forContext(context, currentUser.userId).hasApplied.load(job.id);
  }

  @Query(() => [Object])
  async savedJobOpportunities(
    @Context() context: any,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.getSavedJobs(currentUser.userId, page, limit);
  }

  @Mutation(() => Boolean)
  async saveJobOpportunity(
    @Context() context: any,
    @Args("jobOpportunityId", { type: () => ID }) jobOpportunityId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.resettingLoaders(context, () =>
      this.jobsService.saveJob(currentUser.userId, jobOpportunityId),
    );
  }

  @Mutation(() => Boolean)
  async unsaveJobOpportunity(
    @Context() context: any,
    @Args("jobOpportunityId", { type: () => ID }) jobOpportunityId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.resettingLoaders(context, () =>
      this.jobsService.unsaveJob(currentUser.userId, jobOpportunityId),
    );
  }

  @Query(() => [Object])
  async jobOpportunities(
    @Args("filters", { nullable: true }) filters?: any,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    return this.jobsService.findAll(filters, page, limit);
  }

  @Query(() => Object, { nullable: true })
  async jobOpportunity(@Args("id") id: string) {
    return this.jobsService.findById(id);
  }

  @Mutation(() => Object)
  async createJobOpportunity(
    @Context() context: any,
    @Args("title") title: string,
    @Args("description") description: string,
    @Args("positionType") positionType: string,
    @Args("level") level: string,
    @Args("country") country: string,
    @Args("city") city: string,
    @Args("salary", { nullable: true }) salary?: number,
    @Args("currency", { nullable: true }) currency?: string,
    @Args("benefits", { nullable: true }) benefits?: string,
    @Args("gender", { nullable: true }) gender?: string,
    @Args("expiresAt", { nullable: true }) expiresAt?: string,
    @Args("division", { nullable: true }) division?: string,
    @Args("licenseLevelRequired", { nullable: true }) licenseLevelRequired?: string,
    @Args("modality", { nullable: true }) modality?: string,
    @Args("umpireCategory", { nullable: true }) umpireCategory?: string,
    @Args("matchDate", { nullable: true }) matchDate?: string
  ) {
    const currentUser = this.requireUser(context);
    if (currentUser.role !== "CLUB") {
      throw new ForbiddenException("Only clubs can post job opportunities");
    }

    return this.jobsService.create({
      title,
      description,
      positionType,
      level,
      clubId: currentUser.userId,
      country,
      city,
      salary,
      currency,
      benefits,
      gender,
      expiresAt,
      division,
      licenseLevelRequired,
      modality,
      umpireCategory,
      matchDate,
    });
  }

  @Mutation(() => Object)
  async updateJobOpportunity(
    @Context() context: any,
    @Args("id") id: string,
    @Args("status", { nullable: true }) status?: string
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.update(id, { status }, currentUser);
  }

  @Mutation(() => Boolean)
  async deleteJobOpportunity(
    @Context() context: any,
    @Args("id") id: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.delete(id, currentUser);
  }

  // Job Applications
  @Mutation(() => Object)
  async applyForJob(
    @Context() context: any,
    @Args("jobOpportunityId") jobOpportunityId: string,
    @Args("userId", { nullable: true }) userId?: string,
    @Args("coverLetter", { nullable: true }) coverLetter?: string,
    @Args("resumeUrl", { nullable: true }) resumeUrl?: string
  ) {
    const currentUser = this.requireUser(context);
    this.assertSameUserIfProvided(currentUser, userId);
    return this.resettingLoaders(context, () =>
      this.jobsService.applyForJob({
        jobOpportunityId,
        userId: currentUser.userId,
        role: currentUser.role,
        coverLetter,
        resumeUrl,
      }),
    );
  }

  @Query(() => [Object])
  async jobApplications(
    @Context() context: any,
    @Args("jobOpportunityId") jobOpportunityId: string,
    @Args("status", { nullable: true }) status?: string,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.getApplications(
      jobOpportunityId,
      status,
      currentUser,
      page,
      limit,
    );
  }

  @Query(() => [Object])
  async userApplications(
    @Context() context: any,
    @Args("userId") userId: string,
    @Args("status", { nullable: true }) status?: string,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    const currentUser = this.requireUser(context);
    if (currentUser.userId !== userId && currentUser.role !== "SUPERADMIN") {
      throw new ForbiddenException("You can only view your own applications");
    }
    return this.jobsService.getUserApplications(userId, status, page, limit);
  }

  @Query(() => Object, { nullable: true })
  async jobApplication(@Context() context: any, @Args("id") id: string) {
    const currentUser = this.requireUser(context);
    return this.jobsService.getApplicationById(id, currentUser);
  }

  @Query(() => [Object])
  async getClubApplications(
    @Context() context: any,
    @Args("clubId", { type: () => ID }) clubId: string,
    @Args("status", { nullable: true }) status?: string,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.getClubApplications(
      currentUser.userId,
      clubId,
      status,
      page,
      limit,
    );
  }

  @Mutation(() => Object)
  async updateApplicationStatus(
    @Context() context: any,
    @Args("applicationId", { type: () => ID }) applicationId: string,
    @Args("status") status: string,
    @Args("notes", { nullable: true }) notes?: string
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.updateApplicationStatus(
      currentUser.userId,
      applicationId,
      status,
      notes,
    );
  }

  @Mutation(() => Object)
  async withdrawApplication(
    @Context() context: any,
    @Args("id") id: string,
    @Args("userId", { nullable: true }) userId?: string
  ) {
    const currentUser = this.requireUser(context);
    this.assertSameUserIfProvided(currentUser, userId);
    return this.resettingLoaders(context, () =>
      this.jobsService.withdrawApplication(id, currentUser.userId),
    );
  }
}
