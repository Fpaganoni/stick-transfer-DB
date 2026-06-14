import { Injectable } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async changeUserRole(userId: string, role: Role) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }

  async setUserVerified(userId: string, verified: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isVerified: verified },
    });
  }

  async setUserActive(userId: string, active: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: active },
    });
  }

  async getDashboardStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsersCount,
      playersCount,
      coachesCount,
      clubsCount,
      superAdminsCount,
      activeUsersCount,
      verifiedClubsCount,
      pendingVerificationClubsCount,
      unverifiedClubsCount,
      rejectedClubsCount,
      openJobsCount,
      closedJobsCount,
      filledJobsCount,
      totalApplicationsCount,
      pendingApplicationsCount,
      acceptedApplicationsCount,
      rejectedApplicationsCount,
      totalReportsCount,
      pendingReportsCount,
      reviewedReportsCount,
      actionTakenReportsCount,
      publishedNewsCount,
      draftNewsCount,
      pendingClubMembershipsCount,
      activeClubMembershipsCount,
      newUsersLast7Days,
      newUsersLast30Days,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: "PLAYER" } }),
      this.prisma.user.count({ where: { role: "COACH" } }),
      this.prisma.user.count({ where: { role: "CLUB" } }),
      this.prisma.user.count({ where: { role: "SUPERADMIN" } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.club.count({ where: { verificationStatus: "VERIFIED" } }),
      this.prisma.club.count({ where: { verificationStatus: "PENDING" } }),
      this.prisma.club.count({ where: { verificationStatus: "UNVERIFIED" } }),
      this.prisma.club.count({ where: { verificationStatus: "REJECTED" } }),
      this.prisma.jobOpportunity.count({ where: { status: "OPEN" } }),
      this.prisma.jobOpportunity.count({ where: { status: "CLOSED" } }),
      this.prisma.jobOpportunity.count({ where: { status: "FILLED" } }),
      this.prisma.jobApplication.count(),
      this.prisma.jobApplication.count({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      this.prisma.jobApplication.count({ where: { status: "ACCEPTED" } }),
      this.prisma.jobApplication.count({ where: { status: "REJECTED" } }),
      this.prisma.report.count(),
      this.prisma.report.count({ where: { status: "PENDING" } }),
      this.prisma.report.count({ where: { status: "REVIEWED" } }),
      this.prisma.report.count({ where: { status: "ACTION_TAKEN" } }),
      this.prisma.newsArticle.count({ where: { isPublished: true } }),
      this.prisma.newsArticle.count({ where: { isPublished: false } }),
      this.prisma.clubMember.count({ where: { status: "PENDING" } }),
      this.prisma.clubMember.count({ where: { status: "ACTIVE" } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    return {
      totalUsersCount,
      playersCount,
      coachesCount,
      clubsCount,
      superAdminsCount,
      activeUsersCount,
      verifiedClubsCount,
      pendingVerificationClubsCount,
      unverifiedClubsCount,
      rejectedClubsCount,
      openJobsCount,
      closedJobsCount,
      filledJobsCount,
      totalApplicationsCount,
      pendingApplicationsCount,
      acceptedApplicationsCount,
      rejectedApplicationsCount,
      totalReportsCount,
      pendingReportsCount,
      reviewedReportsCount,
      actionTakenReportsCount,
      publishedNewsCount,
      draftNewsCount,
      pendingClubMembershipsCount,
      activeClubMembershipsCount,
      newUsersLast7Days,
      newUsersLast30Days,
    };
  }
}
