import { Resolver, Query, Mutation, Args, Context, ID } from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import { ReportService } from "./report.service";
import { AuthService } from "../auth/auth.service";

@Resolver("Report")
export class ReportResolver {
  constructor(
    private reportService: ReportService,
    private authService: AuthService,
  ) {}

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.authService.getUserFromAuthHeader(
      context?.req?.headers?.authorization,
    );
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  private requireSuperAdmin(context: any): { userId: string; role: string } {
    const user = this.requireUser(context);
    if (user.role !== "SUPERADMIN") {
      throw new ForbiddenException("Super admin access required");
    }
    return user;
  }

  @Mutation()
  async createReport(
    @Context() context: any,
    @Args("targetType") targetType: ReportTargetType,
    @Args("targetId", { type: () => ID }) targetId: string,
    @Args("reason") reason: ReportReason,
    @Args("description", { nullable: true }) description?: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.reportService.createReport({
      reporterId: currentUser.userId,
      targetType,
      targetId,
      reason,
      description,
    });
  }

  @Query()
  async reports(
    @Context() context: any,
    @Args("status", { nullable: true }) status?: ReportStatus,
    @Args("targetType", { nullable: true }) targetType?: ReportTargetType,
    @Args("page", { nullable: true }) page?: number,
    @Args("limit", { nullable: true }) limit?: number,
  ) {
    this.requireSuperAdmin(context);
    return this.reportService.getReports({ status, targetType }, page, limit);
  }

  @Query()
  async report(@Context() context: any, @Args("id", { type: () => ID }) id: string) {
    this.requireSuperAdmin(context);
    return this.reportService.getReportById(id);
  }

  @Mutation()
  async updateReportStatus(
    @Context() context: any,
    @Args("id", { type: () => ID }) id: string,
    @Args("status") status: ReportStatus,
  ) {
    const currentUser = this.requireSuperAdmin(context);
    return this.reportService.updateStatus(id, status, currentUser.userId);
  }
}
