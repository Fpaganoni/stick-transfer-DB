import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { NotificationType, Prisma, UmpireModality } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { normalizePagination } from "../common/pagination";
import { AppError } from "../common/errors/app.error";
import { checkCountry, countryFilter, normalizeCountry } from "../common/geo/countries";

export type JobActor = { userId: string; role: string };

export const POSITION_TYPES = ["PLAYER", "COACH", "STAFF", "UMPIRE", "OTHER"];
const UMPIRE_MODALITIES: string[] = Object.values(UmpireModality);

const ALREADY_APPLIED_MESSAGE = "You have already applied for this job";

/** Final club decisions: they cannot be withdrawn, so withdraw + re-apply cannot undo them. */
const DECIDED_STATUSES = ["REJECTED", "ACCEPTED"] as const;

/** Newest first; id breaks timestamp ties so offset pages never repeat or drop rows. */
const APPLICATION_ORDER: Prisma.JobApplicationOrderByWithRelationInput[] = [
  { appliedAt: "desc" },
  { id: "desc" },
];

const APPLICATION_WITH_CLUB = {
  user: true,
  jobOpportunity: { include: { club: true } },
} as const;

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /** Job.clubId === Club.id === owning User.id. Owner club or SUPERADMIN only. */
  private async assertCanManageJob(jobOpportunityId: string, actor: JobActor) {
    const job = await this.prisma.jobOpportunity.findUnique({
      where: { id: jobOpportunityId },
      select: { id: true, clubId: true },
    });
    if (!job) throw new NotFoundException("Job opportunity not found");
    if (job.clubId !== actor.userId && actor.role !== "SUPERADMIN") {
      throw new ForbiddenException("You do not own this job opportunity");
    }
  }

  /** Case-insensitive; invalid values become a 400 instead of a masked 500. */
  private parsePositionType(raw: string): string {
    const value = String(raw).trim().toUpperCase();
    if (!POSITION_TYPES.includes(value)) {
      throw new BadRequestException(
        `Invalid positionType. Allowed: ${POSITION_TYPES.join(", ")}`,
      );
    }
    return value;
  }

  /** Case-insensitive; legacy CESPED/SALA and unknown values are a 400. */
  private parseModality(raw: string): string {
    const value = String(raw).trim().toUpperCase();
    if (!UMPIRE_MODALITIES.includes(value)) {
      throw new BadRequestException(
        `Invalid modality. Allowed: ${UMPIRE_MODALITIES.join(", ")}`,
      );
    }
    return value;
  }

  private parseDate(raw: string, label: string): Date {
    const d = new Date(raw);
    if (isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid ${label}. Use an ISO 8601 date`);
    }
    return d;
  }

  async findAll(
    filters?: {
      country?: string;
      positionType?: string;
      level?: string;
      gender?: string;
      search?: string;
      clubId?: string;
      status?: string;
      division?: string;
      expiresAfter?: string;
      licenseLevelRequired?: string;
      modality?: string;
      umpireCategory?: string;
      matchDateFrom?: string;
      matchDateTo?: string;
    },
    page?: number,
    limit?: number,
  ) {
    const where: any = {};
    if (filters?.country) where.country = countryFilter(filters.country);
    if (filters?.positionType) {
      where.positionType = this.parsePositionType(filters.positionType) as any;
    }
    if (filters?.level) where.level = filters.level as any;
    if (filters?.gender) where.gender = filters.gender as any;
    if (filters?.clubId) where.clubId = filters.clubId;
    if (filters?.status) where.status = filters.status as any;
    if (filters?.division) where.division = filters.division;
    if (filters?.expiresAfter) {
      where.expiresAt = { gte: new Date(filters.expiresAfter) };
    }
    if (filters?.licenseLevelRequired) {
      where.licenseLevelRequired = filters.licenseLevelRequired as any;
    }
    if (filters?.modality) where.modality = this.parseModality(filters.modality);
    if (filters?.umpireCategory) where.umpireCategory = filters.umpireCategory as any;
    if (filters?.matchDateFrom || filters?.matchDateTo) {
      where.matchDate = {
        ...(filters.matchDateFrom && {
          gte: this.parseDate(filters.matchDateFrom, "matchDateFrom"),
        }),
        ...(filters.matchDateTo && {
          lte: this.parseDate(filters.matchDateTo, "matchDateTo"),
        }),
      };
    }
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const { skip, take } = normalizePagination(page, limit);

    return this.prisma.jobOpportunity.findMany({
      where,
      include: {
        club: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    });
  }

  async findById(id: string) {
    return this.prisma.jobOpportunity.findUnique({
      where: { id },
      include: {
        club: true,
      },
    });
  }

  async create(data: {
    title: string;
    description: string;
    positionType: string;
    level: string;
    clubId: string;
    country: string;
    city: string;
    salary?: number;
    currency?: string;
    benefits?: string;
    gender?: string;
    expiresAt?: string;
    division?: string;
    licenseLevelRequired?: string;
    modality?: string;
    umpireCategory?: string;
    matchDate?: string;
  }) {
    if (data.salary != null && data.salary < 0) {
      throw new BadRequestException("salary cannot be negative");
    }
    // country is required (non-null in the SDL), so a blank value is invalid too
    const countryError = checkCountry(data.country ?? "");
    if (countryError) throw AppError.validation([countryError]);

    const positionType = this.parsePositionType(data.positionType);
    if (
      positionType !== "UMPIRE" &&
      (data.licenseLevelRequired ||
        data.modality ||
        data.umpireCategory ||
        data.matchDate)
    ) {
      throw new BadRequestException(
        "licenseLevelRequired, modality, umpireCategory and matchDate are only allowed when positionType is UMPIRE",
      );
    }
    const matchDate = data.matchDate
      ? this.parseDate(data.matchDate, "matchDate")
      : undefined;
    const modality = data.modality ? this.parseModality(data.modality) : undefined;

    const activeJobsCount = await this.prisma.jobOpportunity.count({
      where: { clubId: data.clubId, status: "OPEN" },
    });
    if (activeJobsCount >= 5) {
      throw new ForbiddenException(
        "Your club has reached the limit of 5 active job opportunities",
      );
    }

    return this.prisma.jobOpportunity.create({
      data: {
        ...data,
        country: normalizeCountry(data.country),
        positionType: positionType as any,
        level: data.level as any,
        currency: data.currency as any,
        gender: data.gender as any,
        licenseLevelRequired: data.licenseLevelRequired as any,
        modality: modality as any,
        umpireCategory: data.umpireCategory as any,
        matchDate,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      },
      include: {
        club: true,
      },
    });
  }

  async update(id: string, data: { status?: string }, actor: JobActor) {
    await this.assertCanManageJob(id, actor);
    return this.prisma.jobOpportunity.update({
      where: { id },
      data: {
        status: data.status as any,
      },
      include: {
        club: true,
      },
    });
  }

  async delete(id: string, actor: JobActor) {
    await this.assertCanManageJob(id, actor);
    await this.prisma.jobOpportunity.delete({ where: { id } });
    return true;
  }

  // Job Applications
  async applyForJob(data: {
    jobOpportunityId: string;
    userId: string;
    role: string;
    coverLetter?: string;
    resumeUrl?: string;
  }) {
    const job = await this.prisma.jobOpportunity.findUnique({
      where: { id: data.jobOpportunityId },
      select: { id: true, positionType: true },
    });
    if (!job) throw new NotFoundException("Job opportunity not found");
    if (
      job.positionType === "UMPIRE" &&
      data.role !== "UMPIRE" &&
      data.role !== "SUPERADMIN"
    ) {
      throw new ForbiddenException(
        "Only umpires can apply to UMPIRE job opportunities",
      );
    }

    // (jobOpportunityId, userId) is unique: a WITHDRAWN row is reactivated
    // instead of blocking the applicant from ever applying again.
    const existing = await this.prisma.jobApplication.findUnique({
      where: {
        jobOpportunityId_userId: {
          jobOpportunityId: data.jobOpportunityId,
          userId: data.userId,
        },
      },
      select: { id: true, status: true },
    });
    if (existing && existing.status !== "WITHDRAWN") {
      throw new ConflictException(ALREADY_APPLIED_MESSAGE);
    }

    try {
      const application = existing
        ? await this.reactivateApplication(existing.id, data)
        : await this.prisma.jobApplication.create({
            data: {
              jobOpportunityId: data.jobOpportunityId,
              userId: data.userId,
              coverLetter: data.coverLetter,
              resumeUrl: data.resumeUrl,
            },
            include: APPLICATION_WITH_CLUB,
          });

      const clubOwnerId = application.jobOpportunity.club.id;
      this.eventEmitter.emit("job.application_received", {
        actorId: data.userId,
        recipientId: clubOwnerId,
        type: NotificationType.APPLICATION_RECEIVED,
        entityId: application.id,
      });

      return application;
    } catch (error) {
      if (error.code === "P2002") {
        throw new ConflictException(ALREADY_APPLIED_MESSAGE);
      }
      throw error;
    }
  }

  /**
   * Resets a WITHDRAWN application to PENDING with the new payload. The club's
   * review trail (reviewedAt/reviewedBy/notes) is kept: only an UNDER_REVIEW or
   * PENDING application can be withdrawn, and its notes belong to the club.
   * The status guard in the WHERE makes it atomic: a concurrent apply (or a
   * club decision made after our read) matches 0 rows and is rejected instead
   * of being overwritten.
   */
  private async reactivateApplication(
    applicationId: string,
    data: { coverLetter?: string; resumeUrl?: string },
  ) {
    const { count } = await this.prisma.jobApplication.updateMany({
      where: { id: applicationId, status: "WITHDRAWN" },
      data: {
        status: "PENDING",
        coverLetter: data.coverLetter ?? null,
        resumeUrl: data.resumeUrl ?? null,
        appliedAt: new Date(),
      },
    });
    if (count === 0) throw new ConflictException(ALREADY_APPLIED_MESSAGE);

    return this.prisma.jobApplication.findUniqueOrThrow({
      where: { id: applicationId },
      include: APPLICATION_WITH_CLUB,
    });
  }

  async getApplications(
    jobOpportunityId: string,
    status: string | undefined,
    actor: JobActor,
    page?: number,
    limit?: number,
  ) {
    await this.assertCanManageJob(jobOpportunityId, actor);
    const { skip, take } = normalizePagination(page, limit);
    return this.prisma.jobApplication.findMany({
      where: {
        jobOpportunityId,
        status: status as any,
      },
      include: {
        user: true,
      },
      orderBy: APPLICATION_ORDER,
      skip,
      take,
    });
  }

  async getUserApplications(
    userId: string,
    status?: string,
    page?: number,
    limit?: number,
  ) {
    const { skip, take } = normalizePagination(page, limit);
    return this.prisma.jobApplication.findMany({
      where: {
        userId,
        status: status as any,
      },
      include: {
        jobOpportunity: {
          include: {
            club: true,
          },
        },
      },
      orderBy: APPLICATION_ORDER,
      skip,
      take,
    });
  }

  /** Visible to the applicant, the owning club and SUPERADMIN only. */
  async getApplicationById(id: string, actor: JobActor) {
    const application = await this.prisma.jobApplication.findUnique({
      where: { id },
      include: {
        user: true,
        jobOpportunity: {
          include: {
            club: true,
          },
        },
      },
    });
    if (!application) return null;
    const allowed =
      application.userId === actor.userId ||
      application.jobOpportunity.clubId === actor.userId ||
      actor.role === "SUPERADMIN";
    if (!allowed) {
      throw new ForbiddenException("You cannot view this application");
    }
    return application;
  }

  async updateApplicationStatus(
    currentUserId: string,
    applicationId: string,
    status: string,
    notes?: string,
  ) {
    const application = await this.prisma.jobApplication.findUnique({
      where: { id: applicationId },
      include: { jobOpportunity: { include: { club: true } } },
    });
    if (!application) throw new NotFoundException("Application not found");
    if (application.jobOpportunity.club.id !== currentUserId) {
      throw new ForbiddenException("You are not the admin of this club");
    }

    const updated = await this.prisma.jobApplication.update({
      where: { id: applicationId },
      data: {
        status: status as any,
        reviewedAt: new Date(),
        reviewedBy: currentUserId,
        notes,
      },
      include: {
        user: true,
        jobOpportunity: true,
      },
    });

    this.eventEmitter.emit("job.application_status_updated", {
      actorId: currentUserId,
      recipientId: application.userId,
      type: NotificationType.JOB_APPLICATION_UPDATE,
      entityId: applicationId,
    });

    return updated;
  }

  async getClubApplications(
    currentUserId: string,
    clubId: string,
    status?: string,
    page?: number,
    limit?: number,
  ) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!club) throw new NotFoundException("Club not found");
    if (club.id !== currentUserId) {
      throw new ForbiddenException("You are not the admin of this club");
    }

    const where: any = { jobOpportunity: { clubId } };
    if (status) where.status = status as any;

    const { skip, take } = normalizePagination(page, limit);

    return this.prisma.jobApplication.findMany({
      where,
      include: {
        user: true,
        jobOpportunity: { include: { club: true } },
      },
      orderBy: APPLICATION_ORDER,
      skip,
      take,
    });
  }

  async withdrawApplication(id: string, userId: string) {
    const application = await this.prisma.jobApplication.findFirst({
      where: { id, userId },
    });

    if (!application) {
      throw new NotFoundException("Application not found or not authorized");
    }

    // Re-applying reactivates WITHDRAWN rows, so the club's final decisions
    // must stay sticky: otherwise withdraw + apply would reset them to PENDING.
    // The guard is in the WHERE so a decision that lands after the read above
    // matches no row instead of being overwritten.
    const { count } = await this.prisma.jobApplication.updateMany({
      where: { id, userId, status: { notIn: [...DECIDED_STATUSES] } },
      data: { status: "WITHDRAWN" },
    });
    if (count === 0) {
      throw new ForbiddenException(
        "An accepted or rejected application cannot be withdrawn",
      );
    }

    return this.prisma.jobApplication.findUniqueOrThrow({ where: { id } });
  }

  // ─── Saved Jobs ────────────────────────────────────────────────────────

  /** Batched for the per-request loader: ONE query for any number of jobs. */
  async findSavedJobIds(
    userId: string,
    jobOpportunityIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId, jobOpportunityId: { in: jobOpportunityIds } },
      select: { jobOpportunityId: true },
    });
    return new Set(rows.map((row) => row.jobOpportunityId));
  }

  /** Batched like findSavedJobIds; WITHDRAWN applications do not count. */
  async findAppliedJobIds(
    userId: string,
    jobOpportunityIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.jobApplication.findMany({
      where: {
        userId,
        jobOpportunityId: { in: jobOpportunityIds },
        status: { not: "WITHDRAWN" },
      },
      select: { jobOpportunityId: true },
    });
    return new Set(rows.map((row) => row.jobOpportunityId));
  }

  /**
   * Idempotent: P2002 (already saved) is success. A missing job surfaces as a
   * foreign-key violation (P2003) and becomes a 404 instead of a masked 500;
   * mapping the DB error (no pre-check query) also covers a delete race.
   */
  async saveJob(userId: string, jobOpportunityId: string) {
    try {
      await this.prisma.savedJob.create({ data: { userId, jobOpportunityId } });
    } catch (error) {
      if (error?.code === "P2003") {
        throw new NotFoundException("Job opportunity not found");
      }
      if (error?.code !== "P2002") throw error;
    }
    return true;
  }

  async unsaveJob(userId: string, jobOpportunityId: string) {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobOpportunityId } });
    return true;
  }

  async getSavedJobs(userId: string, page?: number, limit?: number) {
    const { skip, take } = normalizePagination(page, limit);
    const saved = await this.prisma.savedJob.findMany({
      where: { userId },
      include: { jobOpportunity: { include: { club: true } } },
      orderBy: [{ savedAt: "desc" }, { id: "desc" }],
      skip,
      take,
    });
    return saved.map((s) => s.jobOpportunity);
  }
}
