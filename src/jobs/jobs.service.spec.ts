import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { JobsService } from "./jobs.service";
import { PrismaService } from "../prisma.service";

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
  },
  jobApplication: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
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
        expect.objectContaining({ orderBy: { createdAt: "desc" } })
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
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe("delete", () => {
    it("should delete job and return true", async () => {
      prisma.jobOpportunity.delete.mockResolvedValue({});
      const result = await service.delete("job-1");
      expect(prisma.jobOpportunity.delete).toHaveBeenCalledWith({ where: { id: "job-1" } });
      expect(result).toBe(true);
    });
  });

  // ── applyForJob ───────────────────────────────────────────────────────────
  describe("applyForJob", () => {
    const applicationData = {
      jobOpportunityId: "job-1",
      userId: "user-1",
      coverLetter: "I want to join!",
    };

    it("should create an application with cover letter", async () => {
      const mockApplication = {
        id: "app-1",
        ...applicationData,
        jobOpportunity: { club: { adminId: "club-admin-1" } },
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
  });

  // ── withdrawApplication ───────────────────────────────────────────────────
  describe("withdrawApplication", () => {
    it("should set application status to WITHDRAWN", async () => {
      const mockApp = { id: "app-1", userId: "user-1" };
      prisma.jobApplication.findFirst.mockResolvedValue(mockApp);
      prisma.jobApplication.update.mockResolvedValue({ ...mockApp, status: "WITHDRAWN" });

      await service.withdrawApplication("app-1", "user-1");

      expect(prisma.jobApplication.update).toHaveBeenCalledWith({
        where: { id: "app-1" },
        data: { status: "WITHDRAWN" },
      });
    });

    it("should throw if application not found or belongs to another user", async () => {
      // Critical: prevents users from withdrawing other users' applications
      prisma.jobApplication.findFirst.mockResolvedValue(null);

      await expect(service.withdrawApplication("app-1", "attacker-user")).rejects.toThrow(
        "Application not found or not authorized"
      );
      expect(prisma.jobApplication.update).not.toHaveBeenCalled();
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
        jobOpportunity: { club: { adminId: currentUserId } },
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
        jobOpportunity: { club: { adminId: "someone-else" } },
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

      await service.getApplications("job-1", "PENDING");

      expect(prisma.jobApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { jobOpportunityId: "job-1", status: "PENDING" },
        })
      );
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
});
