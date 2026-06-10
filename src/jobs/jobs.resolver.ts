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
import { UnauthorizedException } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { AuthService } from "../auth/auth.service";

@Resolver("JobOpportunity")
export class JobsResolver {
  constructor(
    private jobsService: JobsService,
    private authService: AuthService,
  ) {}

  private getCurrentUser(context: any): { userId: string; role: string } | null {
    return this.authService.getUserFromAuthHeader(
      context?.req?.headers?.authorization,
    );
  }

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.getCurrentUser(context);
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  // Field resolver for isSavedByCurrentUser — optional auth, false for anonymous
  @ResolveField()
  async isSavedByCurrentUser(@Parent() job: any, @Context() context: any) {
    const currentUser = this.getCurrentUser(context);
    if (!currentUser) return false;
    return this.jobsService.isSavedByUser(currentUser.userId, job.id);
  }

  @Query(() => [Object])
  async savedJobOpportunities(@Context() context: any) {
    const currentUser = this.requireUser(context);
    return this.jobsService.getSavedJobs(currentUser.userId);
  }

  @Mutation(() => Boolean)
  async saveJobOpportunity(
    @Context() context: any,
    @Args("jobOpportunityId", { type: () => ID }) jobOpportunityId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.saveJob(currentUser.userId, jobOpportunityId);
  }

  @Mutation(() => Boolean)
  async unsaveJobOpportunity(
    @Context() context: any,
    @Args("jobOpportunityId", { type: () => ID }) jobOpportunityId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.jobsService.unsaveJob(currentUser.userId, jobOpportunityId);
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
    @Args("title") title: string,
    @Args("description") description: string,
    @Args("positionType") positionType: string,
    @Args("level") level: string,
    @Args("clubId") clubId: string,
    @Args("country") country: string,
    @Args("city") city: string,
    @Args("salary", { nullable: true }) salary?: number,
    @Args("currency", { nullable: true }) currency?: string,
    @Args("benefits", { nullable: true }) benefits?: string,
    @Args("gender", { nullable: true }) gender?: string,
    @Args("expiresAt", { nullable: true }) expiresAt?: string,
    @Args("division", { nullable: true }) division?: string
  ) {
    return this.jobsService.create({
      title,
      description,
      positionType,
      level,
      clubId,
      country,
      city,
      salary,
      currency,
      benefits,
      gender,
      expiresAt,
      division,
    });
  }

  @Mutation(() => Object)
  async updateJobOpportunity(
    @Args("id") id: string,
    @Args("status", { nullable: true }) status?: string
  ) {
    return this.jobsService.update(id, { status });
  }

  @Mutation(() => Boolean)
  async deleteJobOpportunity(@Args("id") id: string) {
    return this.jobsService.delete(id);
  }

  // Job Applications
  @Mutation(() => Object)
  async applyForJob(
    @Args("jobOpportunityId") jobOpportunityId: string,
    @Args("userId") userId: string,
    @Args("coverLetter", { nullable: true }) coverLetter?: string,
    @Args("resumeUrl", { nullable: true }) resumeUrl?: string
  ) {
    return this.jobsService.applyForJob({
      jobOpportunityId,
      userId,
      coverLetter,
      resumeUrl,
    });
  }

  @Query(() => [Object])
  async jobApplications(
    @Args("jobOpportunityId") jobOpportunityId: string,
    @Args("status", { nullable: true }) status?: string
  ) {
    return this.jobsService.getApplications(jobOpportunityId, status);
  }

  @Query(() => [Object])
  async userApplications(
    @Args("userId") userId: string,
    @Args("status", { nullable: true }) status?: string
  ) {
    return this.jobsService.getUserApplications(userId, status);
  }

  @Query(() => Object, { nullable: true })
  async jobApplication(@Args("id") id: string) {
    return this.jobsService.getApplicationById(id);
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
    @Args("id") id: string,
    @Args("userId") userId: string
  ) {
    return this.jobsService.withdrawApplication(id, userId);
  }
}
