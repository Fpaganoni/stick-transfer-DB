import { Test, TestingModule } from "@nestjs/testing";
import { ExploreService } from "./explore.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  user: {
    findMany: jest.fn(),
  },
  club: {
    findMany: jest.fn(),
  },
};

describe("ExploreService", () => {
  let service: ExploreService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExploreService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ExploreService>(ExploreService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
  });

  describe("getExploreUsers", () => {
    it("restricts to PLAYER and COACH when no role filter is provided", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getExploreUsers({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            role: { in: ["PLAYER", "COACH"] },
          }),
        }),
      );
    });

    it("filters by the explicit role when provided", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getExploreUsers({ role: "coach" });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            role: "COACH",
          }),
        }),
      );
    });

    it("throws on an invalid role value", async () => {
      await expect(
        service.getExploreUsers({ role: "SUPERADMIN" }),
      ).rejects.toThrow("Invalid role. Allowed: PLAYER, COACH, CLUB");
    });
  });
});
