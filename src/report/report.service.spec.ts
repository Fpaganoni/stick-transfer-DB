import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ReportService } from "./report.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  report: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe("ReportService", () => {
  let service: ReportService;
  let prisma: typeof mockPrismaService;
  let eventEmitter: typeof mockEventEmitter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
    jest.clearAllMocks();
  });

  // ── createReport ─────────────────────────────────────────────────────────
  describe("createReport", () => {
    it("should create a report and notify all superadmins", async () => {
      const input = {
        reporterId: "user-1",
        targetType: "USER" as const,
        targetId: "user-2",
        reason: "SPAM" as const,
        description: "Spamming the feed",
      };
      const mockReport = { id: "report-1", ...input };

      prisma.report.create.mockResolvedValue(mockReport);
      prisma.user.findMany.mockResolvedValue([{ id: "superadmin-1" }]);

      const result = await service.createReport(input);

      expect(prisma.report.create).toHaveBeenCalledWith({
        data: {
          reporterId: input.reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          description: input.description,
        },
        include: { reporter: true },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith("report.created", {
        actorId: "user-1",
        recipientId: "superadmin-1",
        type: "REPORT_RECEIVED",
        entityId: "report-1",
      });
      expect(result).toEqual(mockReport);
    });

    it("should throw if a user tries to report themselves", async () => {
      const input = {
        reporterId: "user-1",
        targetType: "USER" as const,
        targetId: "user-1",
        reason: "SPAM" as const,
      };

      await expect(service.createReport(input)).rejects.toThrow(BadRequestException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it("should throw if a club tries to report itself", async () => {
      const input = {
        reporterId: "club-1",
        targetType: "CLUB" as const,
        targetId: "club-1",
        reason: "FAKE_PROFILE" as const,
      };

      await expect(service.createReport(input)).rejects.toThrow(BadRequestException);
      expect(prisma.report.create).not.toHaveBeenCalled();
    });

    it("should throw a friendly error on duplicate report (P2002)", async () => {
      const input = {
        reporterId: "user-1",
        targetType: "POST" as const,
        targetId: "post-1",
        reason: "SPAM" as const,
      };

      prisma.report.create.mockRejectedValue({ code: "P2002" });

      await expect(service.createReport(input)).rejects.toThrow("You have already reported this.");
    });

    // A CLUB account is reported ONLY on the CLUB axis (USER is normalized).
    describe("single axis for club accounts", () => {
      const aimedAtUser = {
        reporterId: "user-1",
        targetType: "USER" as const,
        targetId: "club-1",
        reason: "SPAM" as const,
      };

      beforeEach(() => {
        prisma.report.create.mockResolvedValue({ id: "report-1" });
        prisma.user.findMany.mockResolvedValue([]);
      });

      it("stores a USER report aimed at a CLUB account on the CLUB axis", async () => {
        prisma.user.findUnique.mockResolvedValue({ role: "CLUB" });

        await service.createReport(aimedAtUser);

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: "club-1" },
          select: { role: true },
        });
        expect(prisma.report.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ targetType: "CLUB", targetId: "club-1" }),
          }),
        );
      });

      it("keeps a USER report aimed at a person on the USER axis", async () => {
        prisma.user.findUnique.mockResolvedValue({ role: "PLAYER" });

        await service.createReport({ ...aimedAtUser, targetId: "user-2" });

        expect(prisma.report.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ targetType: "USER", targetId: "user-2" }),
          }),
        );
      });

      it("keeps a USER report whose target does not exist on the USER axis", async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        await service.createReport(aimedAtUser);

        expect(prisma.report.create).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ targetType: "USER" }) }),
        );
      });

      it("does not look up a role for CLUB or non-user targets", async () => {
        await service.createReport({ ...aimedAtUser, targetType: "CLUB" });
        await service.createReport({ ...aimedAtUser, targetType: "POST", targetId: "post-1" });

        expect(prisma.user.findUnique).not.toHaveBeenCalled();
      });

      it("rejects reporting yourself even when the club is your own account", async () => {
        await expect(
          service.createReport({ ...aimedAtUser, reporterId: "club-1" }),
        ).rejects.toThrow(BadRequestException);
        expect(prisma.report.create).not.toHaveBeenCalled();
      });

      it("treats the same club reported through both axes as already reported", async () => {
        prisma.user.findUnique.mockResolvedValue({ role: "CLUB" });
        prisma.report.create
          .mockResolvedValueOnce({ id: "report-1" })
          .mockRejectedValueOnce({ code: "P2002" });

        await service.createReport(aimedAtUser);

        await expect(service.createReport(aimedAtUser)).rejects.toThrow(
          "You have already reported this.",
        );
        const axes = prisma.report.create.mock.calls.map((call) => call[0].data.targetType);
        expect(axes).toEqual(["CLUB", "CLUB"]);
      });
    });
  });

  // ── getReports ───────────────────────────────────────────────────────────
  describe("getReports", () => {
    it("should return paginated reports with default pagination", async () => {
      const mockReports = [{ id: "report-1" }];
      prisma.report.findMany.mockResolvedValue(mockReports);

      const result = await service.getReports();

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: {},
        include: { reporter: true, reviewedBy: true },
        orderBy: { createdAt: "desc" },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual(mockReports);
    });

    it("should apply status and targetType filters with custom pagination", async () => {
      prisma.report.findMany.mockResolvedValue([]);

      await service.getReports({ status: "PENDING", targetType: "USER" }, 2, 10);

      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { status: "PENDING", targetType: "USER" },
        include: { reporter: true, reviewedBy: true },
        orderBy: { createdAt: "desc" },
        skip: 10,
        take: 10,
      });
    });
  });

  // ── getReportById ────────────────────────────────────────────────────────
  describe("getReportById", () => {
    it("should return the report when found", async () => {
      const mockReport = { id: "report-1" };
      prisma.report.findUnique.mockResolvedValue(mockReport);

      const result = await service.getReportById("report-1");

      expect(prisma.report.findUnique).toHaveBeenCalledWith({
        where: { id: "report-1" },
        include: { reporter: true, reviewedBy: true },
      });
      expect(result).toEqual(mockReport);
    });

    it("should throw NotFoundException when report does not exist", async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.getReportById("missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────
  describe("updateStatus", () => {
    it("should update the report status and reviewer", async () => {
      const mockReport = { id: "report-1", status: "PENDING" };
      const mockUpdated = { id: "report-1", status: "REVIEWED", reviewedById: "superadmin-1" };

      prisma.report.findUnique.mockResolvedValue(mockReport);
      prisma.report.update.mockResolvedValue(mockUpdated);

      const result = await service.updateStatus("report-1", "REVIEWED", "superadmin-1");

      expect(prisma.report.update).toHaveBeenCalledWith({
        where: { id: "report-1" },
        data: {
          status: "REVIEWED",
          reviewedById: "superadmin-1",
          reviewedAt: expect.any(Date),
        },
        include: { reporter: true, reviewedBy: true },
      });
      expect(result).toEqual(mockUpdated);
    });

    it("should throw NotFoundException when report does not exist", async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus("missing", "REVIEWED", "superadmin-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
