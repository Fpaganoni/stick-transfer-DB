import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JobsService } from "./jobs.service";
import { PrismaService } from "../prisma.service";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../common/pagination";

const mockEventEmitter = {
  emit: jest.fn(),
};

const mockPrismaService = {
  jobOpportunity: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  jobApplication: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  club: {
    findUnique: jest.fn(),
  },
  savedJob: {
    create: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe("JobsService", () => {
  let service: JobsService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  // ── findAll ───────────────────────────────────────────────────────────────
  describe("findAll", () => {
    it("should list all jobs when no filters provided", async () => {
      const mockJobs = [{ id: "job-1", title: "Goalkeeper Coach" }];
      prisma.jobOpportunity.findMany.mockResolvedValue(mockJobs);

      const result = await service.findAll();

      expect(prisma.jobOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
      );
      expect(result).toEqual(mockJobs);
    });

    it("should pass filters to Prisma where clause", async () => {
      prisma.jobOpportunity.findMany.mockResolvedValue([]);

      await service.findAll({ country: "Spain", clubId: "club-1", status: "OPEN" });

      const callWhere = prisma.jobOpportunity.findMany.mock.calls[0][0].where;
      expect(callWhere.country).toBe("Spain");
      expect(callWhere.clubId).toBe("club-1");
      expect(callWhere.status).toBe("OPEN");
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────
  describe("findAll - pagination", () => {
    beforeEach(() => prisma.jobOpportunity.findMany.mockResolvedValue([]));

    it("never returns an unbounded list: applies the default page size", async () => {
      await service.findAll();

      expect(prisma.jobOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_PAGE_SIZE, skip: undefined }),
      );
    });

    it("accepts the maximum limit but rejects anything above it", async () => {
      await service.findAll({}, 1, MAX_PAGE_SIZE);
      expect(prisma.jobOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: MAX_PAGE_SIZE }),
      );

      await expect(service.findAll({}, 1, MAX_PAGE_SIZE + 1)).rejects.toThrow(BadRequestException);
    });

    it("breaks createdAt ties by id so pages never repeat or drop rows", async () => {
      await service.findAll();

      expect(prisma.jobOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      );
    });

    it("computes skip from page and limit", async () => {
      await service.findAll({}, 3, 20);

      expect(prisma.jobOpportunity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 40 }),
      );
    });

    it("rejects a non-integer page or limit with a 400", async () => {
      await expect(service.findAll({}, 1.5, 10)).rejects.toThrow(BadRequestException);
      await expect(service.findAll({}, 1, -5)).rejects.toThrow(BadRequestException);
      expect(prisma.jobOpportunity.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getClubApplications - pagination", () => {
    it("bounds the query with the default page size", async () => {
      prisma.club.findUnique.mockResolvedValue({ id: "club-1" });
      prisma.jobApplication.findMany.mockResolvedValue([]);

      await service.getClubApplications("club-1", "club-1");

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: DEFAULT_PAGE_SIZE }),
      );
    });
  });

  describe("findById", () => {
    it("should return job with club included", async () => {
      const mockJob = { id: "job-1", title: "Defender", club: { name: "HC Madrid" } };
      prisma.jobOpportunity.findUnique.mockResolvedValue(mockJob);

      const result = await service.findById("job-1");

      expect(prisma.jobOpportunity.findUnique).toHaveBeenCalledWith({
        where: { id: "job-1" },
        include: { club: true },
      });
      expect(result).toEqual(mockJob);
    });

    it("should return null for non-existent job", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue(null);
      expect(await service.findById("ghost-id")).toBeNull();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a job opportunity with all fields", async () => {
      const input = {
        title: "Forward Player",
        description: "We need a forward",
        positionType: "PLAYER",
        level: "PROFESSIONAL",
        clubId: "club-1",
        country: "Spain",
        city: "Barcelona",
        salary: 3000,
        currency: "EUR",
      };
      const mockJob = { id: "job-new", ...input };
      prisma.jobOpportunity.count.mockResolvedValue(0);
      prisma.jobOpportunity.create.mockResolvedValue(mockJob);

      const result = await service.create(input);

      expect(prisma.jobOpportunity.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: "Forward Player", clubId: "club-1" }),
          include: { club: true },
        })
      );
      expect(result).toEqual(mockJob);
    });

    it("should reject when club already has 5 active job opportunities", async () => {
      const input = {
        title: "Forward Player",
        description: "We need a forward",
        positionType: "PLAYER",
        level: "PROFESSIONAL",
        clubId: "club-1",
        country: "Spain",
        city: "Barcelona",
      };
      prisma.jobOpportunity.count.mockResolvedValue(5);

      await expect(service.create(input)).rejects.toThrow(
        "Your club has reached the limit of 5 active job opportunities"
      );
      expect(prisma.jobOpportunity.create).not.toHaveBeenCalled();
    });
  });

  describe("create - validation", () => {
    it("should reject a negative salary", async () => {
      await expect(
        service.create({
          title: "t", description: "d", positionType: "PLAYER", level: "PROFESSIONAL",
          clubId: "club-1", country: "AR", city: "BA", salary: -1,
        }),
      ).rejects.toThrow("salary cannot be negative");
      expect(prisma.jobOpportunity.create).not.toHaveBeenCalled();
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("should delete job and return true when actor owns the club", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
      prisma.jobOpportunity.delete.mockResolvedValue({});
      const result = await service.delete("job-1", { userId: "club-1", role: "CLUB" });
      expect(prisma.jobOpportunity.delete).toHaveBeenCalledWith({ where: { id: "job-1" } });
      expect(result).toBe(true);
    });

    it("should reject when actor does not own the job", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
      await expect(
        service.delete("job-1", { userId: "club-2", role: "CLUB" }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.jobOpportunity.delete).not.toHaveBeenCalled();
    });

    it("should allow a super admin", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
      prisma.jobOpportunity.delete.mockResolvedValue({});
      await expect(
        service.delete("job-1", { userId: "admin", role: "SUPERADMIN" }),
      ).resolves.toBe(true);
    });

    it("should throw NotFound for a missing job", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue(null);
      await expect(
        service.delete("nope", { userId: "club-1", role: "CLUB" }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ────────────────────────────────────────────────────────────────
  describe("update", () => {
    it("should reject when actor does not own the job", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
      await expect(
        service.update("job-1", { status: "CLOSED" }, { userId: "x", role: "PLAYER" }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.jobOpportunity.update).not.toHaveBeenCalled();
    });

    it("should update when actor owns the job", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
      prisma.jobOpportunity.update.mockResolvedValue({ id: "job-1", status: "CLOSED" });
      await service.update("job-1", { status: "CLOSED" }, { userId: "club-1", role: "CLUB" });
      expect(prisma.jobOpportunity.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "job-1" }, data: { status: "CLOSED" } }),
      );
    });
  });

  // ── applyForJob ───────────────────────────────────────────────────────────
  describe("applyForJob", () => {
    const applicationData = {
      jobOpportunityId: "job-1",
      userId: "user-1",
      role: "PLAYER",
      coverLetter: "I want to join!",
    };

    beforeEach(() => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({
        id: "job-1",
        positionType: "PLAYER",
      });
    });

    it("should create an application with cover letter", async () => {
      const mockApplication = {
        id: "app-1",
        ...applicationData,
        jobOpportunity: { club: { id: "club-admin-1" } },
      };
      prisma.jobApplication.create.mockResolvedValue(mockApplication);

      const result = await service.applyForJob(applicationData);

      expect(prisma.jobApplication.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            jobOpportunityId: "job-1",
            userId: "user-1",
            coverLetter: "I want to join!",
          }),
        })
      );
      expect(result).toEqual(mockApplication);
    });

    it("reports 'already applied' as a 409 Conflict, not a masked 500", async () => {
      prisma.jobApplication.create.mockRejectedValue({ code: "P2002" });

      await expect(service.applyForJob(applicationData)).rejects.toThrow(ConflictException);
    });

    it("should throw 'already applied' on duplicate application (P2002)", async () => {
      prisma.jobApplication.create.mockRejectedValue({ code: "P2002" });

      await expect(service.applyForJob(applicationData)).rejects.toThrow(
        "You have already applied for this job"
      );
    });

    it("should rethrow non-duplicate errors", async () => {
      prisma.jobApplication.create.mockRejectedValue(new Error("DB timeout"));
      await expect(service.applyForJob(applicationData)).rejects.toThrow("DB timeout");
    });

    describe("re-applying after withdrawing", () => {
      const reactivated = {
        id: "app-1",
        jobOpportunity: { club: { id: "club-admin-1" } },
      };

      afterEach(() => {
        prisma.jobApplication.findUnique.mockReset();
        prisma.jobApplication.updateMany.mockReset();
        prisma.jobApplication.findUniqueOrThrow.mockReset();
      });

      it("reactivates a WITHDRAWN application as PENDING instead of failing", async () => {
        prisma.jobApplication.findUnique.mockResolvedValue({
          id: "app-1",
          status: "WITHDRAWN",
        });
        prisma.jobApplication.updateMany.mockResolvedValue({ count: 1 });
        prisma.jobApplication.findUniqueOrThrow.mockResolvedValue(reactivated);

        const result = await service.applyForJob(applicationData);

        expect(prisma.jobApplication.create).not.toHaveBeenCalled();
        expect(prisma.jobApplication.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "app-1", status: "WITHDRAWN" },
            data: expect.objectContaining({
              status: "PENDING",
              coverLetter: "I want to join!",
            }),
          }),
        );
        // The club's review trail survives a withdraw + re-apply cycle.
        const { data } = prisma.jobApplication.updateMany.mock.calls[0][0];
        expect(data).not.toHaveProperty("reviewedAt");
        expect(data).not.toHaveProperty("reviewedBy");
        expect(data).not.toHaveProperty("notes");
        expect(result).toEqual(reactivated);
        expect(mockEventEmitter.emit).toHaveBeenCalledWith(
          "job.application_received",
          expect.objectContaining({ recipientId: "club-admin-1", entityId: "app-1" }),
        );
      });

      it("loses the race safely: no row matched means 'already applied', no event", async () => {
        prisma.jobApplication.findUnique.mockResolvedValue({
          id: "app-1",
          status: "WITHDRAWN",
        });
        prisma.jobApplication.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.applyForJob(applicationData)).rejects.toThrow(
          "You have already applied for this job",
        );
        expect(prisma.jobApplication.findUniqueOrThrow).not.toHaveBeenCalled();
        expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      });

      it.each(["PENDING", "UNDER_REVIEW", "ACCEPTED", "REJECTED"])(
        "still rejects when the existing application is %s",
        async (status) => {
          prisma.jobApplication.findUnique.mockResolvedValue({ id: "app-1", status });

          await expect(service.applyForJob(applicationData)).rejects.toThrow(
            "You have already applied for this job",
          );
          expect(prisma.jobApplication.create).not.toHaveBeenCalled();
          expect(prisma.jobApplication.updateMany).not.toHaveBeenCalled();
        },
      );
    });
  });

  // ── saved jobs ────────────────────────────────────────────────────────────
  describe("saveJob", () => {
    it("saves the job for the user", async () => {
      prisma.savedJob.create.mockResolvedValue({ id: "s1" });

      await expect(service.saveJob("user-1", "job-1")).resolves.toBe(true);

      expect(prisma.savedJob.create).toHaveBeenCalledWith({
        data: { userId: "user-1", jobOpportunityId: "job-1" },
      });
    });

    it("is idempotent: saving twice does not fail (P2002)", async () => {
      prisma.savedJob.create
        .mockResolvedValueOnce({ id: "s1" })
        .mockRejectedValueOnce({ code: "P2002" });

      await expect(service.saveJob("user-1", "job-1")).resolves.toBe(true);
      await expect(service.saveJob("user-1", "job-1")).resolves.toBe(true);
    });

    it("throws NotFoundException (404) when the job does not exist (P2003)", async () => {
      prisma.savedJob.create.mockRejectedValue({ code: "P2003" });

      await expect(service.saveJob("user-1", "missing")).rejects.toThrow(NotFoundException);
    });

    it("rethrows unexpected errors", async () => {
      prisma.savedJob.create.mockRejectedValue(new Error("DB timeout"));

      await expect(service.saveJob("user-1", "job-1")).rejects.toThrow("DB timeout");
    });

    it("rethrows a non-object rejection as-is instead of crashing on error.code", async () => {
      prisma.savedJob.create.mockRejectedValue(null);

      await expect(service.saveJob("user-1", "job-1")).rejects.toBeNull();
    });
  });

  describe("findSavedJobIds", () => {
    it("resolves all requested jobs with ONE savedJob query", async () => {
      prisma.savedJob.findMany.mockResolvedValue([{ jobOpportunityId: "job-2" }]);

      const saved = await service.findSavedJobIds("user-1", ["job-1", "job-2", "job-3"]);

      expect(prisma.savedJob.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.savedJob.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1", jobOpportunityId: { in: ["job-1", "job-2", "job-3"] } },
        select: { jobOpportunityId: true },
      });
      expect([...saved]).toEqual(["job-2"]);
    });
  });

  describe("findAppliedJobIds", () => {
    it("resolves with ONE query and ignores WITHDRAWN applications", async () => {
      prisma.jobApplication.findMany.mockResolvedValue([{ jobOpportunityId: "job-1" }]);

      const applied = await service.findAppliedJobIds("user-1", ["job-1", "job-2"]);

      expect(prisma.jobApplication.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          jobOpportunityId: { in: ["job-1", "job-2"] },
          status: { not: "WITHDRAWN" },
        },
        select: { jobOpportunityId: true },
      });
      expect([...applied]).toEqual(["job-1"]);
    });
  });

  // ── withdrawApplication ───────────────────────────────────────────────────
  describe("withdrawApplication", () => {
    afterEach(() => {
      prisma.jobApplication.updateMany.mockReset();
      prisma.jobApplication.findUniqueOrThrow.mockReset();
    });

    it("should set application status to WITHDRAWN", async () => {
      const mockApp = { id: "app-1", userId: "user-1" };
      prisma.jobApplication.findFirst.mockResolvedValue(mockApp);
      prisma.jobApplication.updateMany.mockResolvedValue({ count: 1 });
      prisma.jobApplication.findUniqueOrThrow.mockResolvedValue({
        ...mockApp,
        status: "WITHDRAWN",
      });

      const result = await service.withdrawApplication("app-1", "user-1");

      expect(prisma.jobApplication.updateMany).toHaveBeenCalledWith({
        where: {
          id: "app-1",
          userId: "user-1",
          status: { notIn: ["REJECTED", "ACCEPTED"] },
        },
        data: { status: "WITHDRAWN" },
      });
      expect(result).toEqual({ ...mockApp, status: "WITHDRAWN" });
    });

    it("refuses to withdraw a decided (REJECTED/ACCEPTED) application, atomically", async () => {
      // The status guard lives in the WHERE, so a club decision that lands
      // between our read and our write is never overwritten: no row matches.
      prisma.jobApplication.findFirst.mockResolvedValue({ id: "app-1", userId: "user-1" });
      prisma.jobApplication.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.withdrawApplication("app-1", "user-1")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.jobApplication.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("should throw if application not found or belongs to another user", async () => {
      // Critical: prevents users from withdrawing other users' applications
      prisma.jobApplication.findFirst.mockResolvedValue(null);

      await expect(service.withdrawApplication("app-1", "attacker-user")).rejects.toThrow(
        "Application not found or not authorized"
      );
      expect(prisma.jobApplication.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── updateApplicationStatus ───────────────────────────────────────────────
  describe("updateApplicationStatus", () => {
    const currentUserId = "club-admin-1";
    const applicationId = "app-1";

    it("should update status and set reviewedAt when current user is the club admin", async () => {
      prisma.jobApplication.findUnique.mockResolvedValue({
        id: applicationId,
        userId: "user-1",
        jobOpportunity: { club: { id: currentUserId } },
      });
      prisma.jobApplication.update.mockResolvedValue({ id: applicationId, status: "ACCEPTED" });

      await service.updateApplicationStatus(currentUserId, applicationId, "ACCEPTED", "Great profile");

      const callData = prisma.jobApplication.update.mock.calls[0][0].data;
      expect(callData.status).toBe("ACCEPTED");
      expect(callData.reviewedAt).toBeInstanceOf(Date);
      expect(callData.reviewedBy).toBe(currentUserId);
      expect(callData.notes).toBe("Great profile");
    });

    it("should reject when current user is not the club admin", async () => {
      prisma.jobApplication.findUnique.mockResolvedValue({
        id: applicationId,
        userId: "user-1",
        jobOpportunity: { club: { id: "someone-else" } },
      });

      await expect(
        service.updateApplicationStatus(currentUserId, applicationId, "ACCEPTED")
      ).rejects.toThrow("You are not the admin of this club");
      expect(prisma.jobApplication.update).not.toHaveBeenCalled();
    });

    it("should throw if application not found", async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(null);

      await expect(
        service.updateApplicationStatus(currentUserId, applicationId, "ACCEPTED")
      ).rejects.toThrow("Application not found");
    });
  });

  // ── getApplications + getUserApplications ─────────────────────────────────
  describe("getApplications", () => {
    it("should return applications for a job, optionally filtered by status", async () => {
      prisma.jobApplication.findMany.mockResolvedValue([{ id: "app-1" }]);

      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });

      await service.getApplications("job-1", "PENDING", { userId: "club-1", role: "CLUB" });

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobOpportunityId: "job-1", status: "PENDING" },
        })
      );
    });
  });

  describe("bounded lists", () => {
    beforeEach(() => {
      prisma.jobApplication.findMany.mockResolvedValue([]);
      prisma.savedJob.findMany.mockResolvedValue([]);
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
    });

    it("getApplications applies the default page size and a stable order", async () => {
      await service.getApplications("job-1", undefined, { userId: "club-1", role: "CLUB" });

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: DEFAULT_PAGE_SIZE,
          orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
        }),
      );
    });

    it("getApplications honours page and limit", async () => {
      await service.getApplications("job-1", undefined, { userId: "club-1", role: "CLUB" }, 2, 10);

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 10 }),
      );
    });

    it("getUserApplications applies the default page size and a stable order", async () => {
      await service.getUserApplications("user-1");

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: DEFAULT_PAGE_SIZE,
          orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
        }),
      );
    });

    it("getUserApplications rejects a limit above the maximum", async () => {
      await expect(
        service.getUserApplications("user-1", undefined, 1, MAX_PAGE_SIZE + 1),
      ).rejects.toThrow(BadRequestException);
    });

    it("getSavedJobs applies the default page size and a stable order", async () => {
      await service.getSavedJobs("user-1");

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          take: DEFAULT_PAGE_SIZE,
          orderBy: [{ savedAt: "desc" }, { id: "desc" }],
        }),
      );
    });

    it("getSavedJobs honours page and limit", async () => {
      await service.getSavedJobs("user-1", 3, 20);

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 40 }),
      );
    });
  });

  describe("getApplications - authorization", () => {
    it("should reject a non-owner", async () => {
      prisma.jobOpportunity.findUnique.mockResolvedValue({ id: "job-1", clubId: "club-1" });
      await expect(
        service.getApplications("job-1", undefined, { userId: "x", role: "PLAYER" }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.jobApplication.findMany).not.toHaveBeenCalled();
    });
  });

  describe("getApplicationById", () => {
    const app = {
      id: "app-1",
      userId: "player-1",
      jobOpportunity: { clubId: "club-1" },
    };

    it.each([
      ["the applicant", { userId: "player-1", role: "PLAYER" }],
      ["the owning club", { userId: "club-1", role: "CLUB" }],
      ["a super admin", { userId: "admin", role: "SUPERADMIN" }],
    ])("should return the application to %s", async (_n, actor) => {
      prisma.jobApplication.findUnique.mockResolvedValue(app);
      await expect(service.getApplicationById("app-1", actor)).resolves.toBe(app);
    });

    it("should reject anyone else", async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(app);
      await expect(
        service.getApplicationById("app-1", { userId: "other", role: "PLAYER" }),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should return null when the application does not exist", async () => {
      prisma.jobApplication.findUnique.mockResolvedValue(null);
      await expect(
        service.getApplicationById("nope", { userId: "x", role: "PLAYER" }),
      ).resolves.toBeNull();
    });
  });

  describe("getUserApplications", () => {
    it("should return all applications from a specific user", async () => {
      prisma.jobApplication.findMany.mockResolvedValue([{ id: "app-2" }]);

      await service.getUserApplications("user-1");

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1", status: undefined },
        })
      );
    });
  });

  // ── UMPIRE opportunities ──────────────────────────────────────────────────
  describe("UMPIRE opportunities", () => {
    const umpireInput = {
      title: "Umpire - Division de Honor",
      description: "Need an umpire",
      positionType: "umpire",
      level: "PROFESSIONAL",
      clubId: "club-1",
      country: "Spain",
      city: "Madrid",
      licenseLevelRequired: "NACIONAL",
      modality: "CESPED",
      umpireCategory: "MASCULINO",
      matchDate: "2026-11-15T10:00:00.000Z",
    };

    it("create accepts UMPIRE (case-insensitive) and stores umpire fields", async () => {
      prisma.jobOpportunity.count.mockResolvedValue(0);
      prisma.jobOpportunity.create.mockResolvedValue({ id: "job-u" });

      await service.create(umpireInput);

      const data = prisma.jobOpportunity.create.mock.calls[0][0].data;
      expect(data.positionType).toBe("UMPIRE");
      expect(data.licenseLevelRequired).toBe("NACIONAL");
      expect(data.modality).toBe("CESPED");
      expect(data.umpireCategory).toBe("MASCULINO");
      expect(data.matchDate).toEqual(new Date("2026-11-15T10:00:00.000Z"));
    });

    it("create rejects an invalid positionType with a clear 400", async () => {
      await expect(
        service.create({ ...umpireInput, positionType: "Referee" }),
      ).rejects.toThrow(
        new BadRequestException(
          "Invalid positionType. Allowed: PLAYER, COACH, STAFF, UMPIRE, OTHER",
        ),
      );
      expect(prisma.jobOpportunity.create).not.toHaveBeenCalled();
    });

    it("create rejects umpire-only fields on a non-UMPIRE job", async () => {
      await expect(
        service.create({ ...umpireInput, positionType: "PLAYER" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("create rejects an invalid matchDate", async () => {
      await expect(
        service.create({ ...umpireInput, matchDate: "not-a-date" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("findAll filters by positionType case-insensitively", async () => {
      prisma.jobOpportunity.findMany.mockResolvedValue([]);

      await service.findAll({ positionType: "umpire" });

      expect(prisma.jobOpportunity.findMany.mock.calls[0][0].where.positionType).toBe(
        "UMPIRE",
      );
    });

    it("findAll rejects an invalid positionType filter with a 400", async () => {
      await expect(service.findAll({ positionType: "Umpires" })).rejects.toThrow(
        "Invalid positionType. Allowed: PLAYER, COACH, STAFF, UMPIRE, OTHER",
      );
    });

    it("findAll applies umpire filters and matchDate range", async () => {
      prisma.jobOpportunity.findMany.mockResolvedValue([]);

      await service.findAll({
        positionType: "UMPIRE",
        licenseLevelRequired: "REGIONAL",
        modality: "SALA",
        umpireCategory: "JUVENIL",
        matchDateFrom: "2026-11-01",
        matchDateTo: "2026-12-01",
      });

      const where = prisma.jobOpportunity.findMany.mock.calls[0][0].where;
      expect(where.licenseLevelRequired).toBe("REGIONAL");
      expect(where.modality).toBe("SALA");
      expect(where.umpireCategory).toBe("JUVENIL");
      expect(where.matchDate).toEqual({
        gte: new Date("2026-11-01"),
        lte: new Date("2026-12-01"),
      });
    });

    describe("applyForJob", () => {
      const base = { jobOpportunityId: "job-u", userId: "user-1" };

      beforeEach(() => {
        prisma.jobOpportunity.findUnique.mockResolvedValue({
          id: "job-u",
          positionType: "UMPIRE",
        });
        prisma.jobApplication.create.mockResolvedValue({
          id: "app-u",
          user: { id: "user-1", role: "UMPIRE" },
          jobOpportunity: { club: { id: "club-1" } },
        });
      });

      it("allows an UMPIRE and emits APPLICATION_RECEIVED", async () => {
        await service.applyForJob({ ...base, role: "UMPIRE" });

        expect(prisma.jobApplication.create).toHaveBeenCalled();
        expect(mockEventEmitter.emit).toHaveBeenCalledWith(
          "job.application_received",
          expect.objectContaining({
            actorId: "user-1",
            recipientId: "club-1",
            type: "APPLICATION_RECEIVED",
          }),
        );
      });

      it("allows a SUPERADMIN", async () => {
        await service.applyForJob({ ...base, role: "SUPERADMIN" });
        expect(prisma.jobApplication.create).toHaveBeenCalled();
      });

      it("rejects a PLAYER with 403", async () => {
        await expect(
          service.applyForJob({ ...base, role: "PLAYER" }),
        ).rejects.toThrow(
          new ForbiddenException("Only umpires can apply to UMPIRE job opportunities"),
        );
        expect(prisma.jobApplication.create).not.toHaveBeenCalled();
        expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      });

      it("throws NotFound for a missing job", async () => {
        prisma.jobOpportunity.findUnique.mockResolvedValue(null);
        await expect(
          service.applyForJob({ ...base, role: "UMPIRE" }),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });
});
