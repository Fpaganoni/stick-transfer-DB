import { Test, TestingModule } from "@nestjs/testing";
import { AdminService } from "./admin.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  user: { count: jest.fn(), update: jest.fn() },
  club: { count: jest.fn() },
  jobOpportunity: { count: jest.fn() },
  jobApplication: { count: jest.fn() },
  report: { count: jest.fn() },
  newsArticle: { count: jest.fn() },
  clubMember: { count: jest.fn() },
};

describe("AdminService", () => {
  let service: AdminService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();

    prisma.user.count.mockResolvedValue(0);
    prisma.club.count.mockResolvedValue(0);
    prisma.jobOpportunity.count.mockResolvedValue(0);
    prisma.jobApplication.count.mockResolvedValue(0);
    prisma.report.count.mockResolvedValue(0);
    prisma.newsArticle.count.mockResolvedValue(0);
    prisma.clubMember.count.mockResolvedValue(0);
  });

  describe("getDashboardStats", () => {
    it("should query users grouped by role, status, and signup window", async () => {
      await service.getDashboardStats();

      expect(prisma.user.count).toHaveBeenCalledWith();
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: "PLAYER" },
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: "COACH" },
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: "CLUB" },
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { role: "SUPERADMIN" },
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: expect.any(Date) } },
      });
    });

    it("should query clubs grouped by verification status", async () => {
      await service.getDashboardStats();

      expect(prisma.club.count).toHaveBeenCalledWith({
        where: { verificationStatus: "VERIFIED" },
      });
      expect(prisma.club.count).toHaveBeenCalledWith({
        where: { verificationStatus: "PENDING" },
      });
      expect(prisma.club.count).toHaveBeenCalledWith({
        where: { verificationStatus: "UNVERIFIED" },
      });
      expect(prisma.club.count).toHaveBeenCalledWith({
        where: { verificationStatus: "REJECTED" },
      });
    });

    it("should query job opportunities grouped by status", async () => {
      await service.getDashboardStats();

      expect(prisma.jobOpportunity.count).toHaveBeenCalledWith({
        where: { status: "OPEN" },
      });
      expect(prisma.jobOpportunity.count).toHaveBeenCalledWith({
        where: { status: "CLOSED" },
      });
      expect(prisma.jobOpportunity.count).toHaveBeenCalledWith({
        where: { status: "FILLED" },
      });
    });

    it("should query job applications grouped by status, mapping UNDER_REVIEW into pending", async () => {
      await service.getDashboardStats();

      expect(prisma.jobApplication.count).toHaveBeenCalledWith();
      expect(prisma.jobApplication.count).toHaveBeenCalledWith({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
      });
      expect(prisma.jobApplication.count).toHaveBeenCalledWith({
        where: { status: "ACCEPTED" },
      });
      expect(prisma.jobApplication.count).toHaveBeenCalledWith({
        where: { status: "REJECTED" },
      });
    });

    it("should query reports grouped by status", async () => {
      await service.getDashboardStats();

      expect(prisma.report.count).toHaveBeenCalledWith();
      expect(prisma.report.count).toHaveBeenCalledWith({
        where: { status: "PENDING" },
      });
      expect(prisma.report.count).toHaveBeenCalledWith({
        where: { status: "REVIEWED" },
      });
      expect(prisma.report.count).toHaveBeenCalledWith({
        where: { status: "ACTION_TAKEN" },
      });
    });

    it("should query news articles grouped by published state", async () => {
      await service.getDashboardStats();

      expect(prisma.newsArticle.count).toHaveBeenCalledWith({
        where: { isPublished: true },
      });
      expect(prisma.newsArticle.count).toHaveBeenCalledWith({
        where: { isPublished: false },
      });
    });

    it("should query club memberships grouped by status", async () => {
      await service.getDashboardStats();

      expect(prisma.clubMember.count).toHaveBeenCalledWith({
        where: { status: "PENDING" },
      });
      expect(prisma.clubMember.count).toHaveBeenCalledWith({
        where: { status: "ACTIVE" },
      });
    });

    it("should return a single aggregated stats object", async () => {
      prisma.user.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(60) // players
        .mockResolvedValueOnce(20) // coaches
        .mockResolvedValueOnce(15) // clubs
        .mockResolvedValueOnce(5) // superadmins
        .mockResolvedValueOnce(90) // active
        .mockResolvedValueOnce(3) // newUsersLast7Days
        .mockResolvedValueOnce(10); // newUsersLast30Days

      const result = await service.getDashboardStats();

      expect(result).toEqual(
        expect.objectContaining({
          totalUsersCount: 100,
          playersCount: 60,
          coachesCount: 20,
          clubsCount: 15,
          superAdminsCount: 5,
          activeUsersCount: 90,
          newUsersLast7Days: 3,
          newUsersLast30Days: 10,
        }),
      );
    });
  });

  describe("changeUserRole", () => {
    it("should update a user's role", async () => {
      prisma.user.update.mockResolvedValue({ id: "user-1", role: "COACH" });

      const result = await service.changeUserRole("user-1", "COACH" as any);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { role: "COACH" },
      });
      expect(result).toEqual({ id: "user-1", role: "COACH" });
    });
  });

  describe("setUserVerified", () => {
    it("should update a user's verified status", async () => {
      prisma.user.update.mockResolvedValue({ id: "user-1", isVerified: true });

      const result = await service.setUserVerified("user-1", true);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { isVerified: true },
      });
      expect(result).toEqual({ id: "user-1", isVerified: true });
    });
  });
});
