import { BadRequestException } from "@nestjs/common";
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

  describe("pagination bounds", () => {
    it("defaults to 50 rows from offset 0", async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.club.findMany.mockResolvedValue([]);

      await service.getExploreUsers({});
      await service.getExploreClubs({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
      expect(prisma.club.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50, skip: 0 }),
      );
    });

    it.each([
      { limit: 1_000_000_000 },
      { limit: 0 },
      { offset: -5 },
    ])("rejects %j before querying", async (page) => {
      await expect(service.getExploreUsers(page)).rejects.toThrow(BadRequestException);
      await expect(service.getExploreClubs(page)).rejects.toThrow(BadRequestException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.club.findMany).not.toHaveBeenCalled();
    });
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

    it("accepts UMPIRE as a role filter", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getExploreUsers({ role: "umpire" });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: "UMPIRE" }),
        }),
      );
    });

    it("applies umpire filters and forces role UMPIRE", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getExploreUsers({
        licenseLevel: "internacional",
        modality: "outdoor",
        umpireCategory: "femenino",
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: "UMPIRE",
            licenseLevel: "INTERNACIONAL",
            modalities: { has: "OUTDOOR" },
            umpireCategories: { has: "FEMENINO" },
          }),
        }),
      );
    });

    it("throws on an invalid umpire filter value", async () => {
      await expect(
        service.getExploreUsers({ licenseLevel: "GALACTICO" }),
      ).rejects.toThrow("Invalid licenseLevel");
    });

    it.each([["CESPED"], ["SALA"]])("rejects the legacy modality %p", async (modality) => {
      await expect(service.getExploreUsers({ modality })).rejects.toThrow(
        "Invalid modality. Allowed: OUTDOOR, INDOOR",
      );
    });

    it("filters by country code case-insensitively: 'ar' finds 'AR'", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getExploreUsers({ country: "ar" });

      expect(prisma.user.findMany.mock.calls[0][0].where.country).toEqual({ in: ["AR"] });
    });

    it("an unknown country filter matches nothing", async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.getExploreUsers({ country: "Argentina" });

      expect(prisma.user.findMany.mock.calls[0][0].where.country).toEqual({ in: [] });
    });
  });

  describe("getExploreClubs", () => {
    it("filters by country code case-insensitively: 'es' finds 'ES'", async () => {
      prisma.club.findMany.mockResolvedValue([]);

      await service.getExploreClubs({ country: "es" });

      expect(prisma.club.findMany.mock.calls[0][0].where.country).toEqual({ in: ["ES"] });
    });

    it("an unknown country filter matches nothing", async () => {
      prisma.club.findMany.mockResolvedValue([]);

      await service.getExploreClubs({ country: "España" });

      expect(prisma.club.findMany.mock.calls[0][0].where.country).toEqual({ in: [] });
    });
  });
});
