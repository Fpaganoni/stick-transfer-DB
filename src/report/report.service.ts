import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType, ReportReason, ReportStatus, ReportTargetType } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class ReportService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async createReport(data: {
    reporterId: string;
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    description?: string;
  }) {
    if (
      (data.targetType === "USER" || data.targetType === "CLUB") &&
      data.targetId === data.reporterId
    ) {
      throw new BadRequestException("You cannot report yourself.");
    }

    try {
      const report = await this.prisma.report.create({
        data: {
          reporterId: data.reporterId,
          targetType: data.targetType,
          targetId: data.targetId,
          reason: data.reason,
          description: data.description,
        },
        include: { reporter: true },
      });

      const superadmins = await this.prisma.user.findMany({
        where: { role: "SUPERADMIN" },
        select: { id: true },
      });

      for (const superadmin of superadmins) {
        this.eventEmitter.emit("report.created", {
          actorId: data.reporterId,
          recipientId: superadmin.id,
          type: NotificationType.REPORT_RECEIVED,
          entityId: report.id,
        });
      }

      return report;
    } catch (error) {
      if (error.code === "P2002") {
        throw new BadRequestException("You have already reported this.");
      }
      throw error;
    }
  }

  async getReports(filters?: { status?: ReportStatus; targetType?: ReportTargetType }, page = 1, limit = 20) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.targetType) where.targetType = filters.targetType;

    return this.prisma.report.findMany({
      where,
      include: { reporter: true, reviewedBy: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async getReportById(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      include: { reporter: true, reviewedBy: true },
    });
    if (!report) throw new NotFoundException("Report not found");
    return report;
  }

  async updateStatus(id: string, status: ReportStatus, reviewerId: string) {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) throw new NotFoundException("Report not found");

    return this.prisma.report.update({
      where: { id },
      data: {
        status,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      include: { reporter: true, reviewedBy: true },
    });
  }
}
