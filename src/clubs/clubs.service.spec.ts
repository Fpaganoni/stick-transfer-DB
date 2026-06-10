import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ClubsService } from "./clubs.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  club: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  clubMember: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe("ClubsService", () => {
  let service: ClubsService;
  let prisma: typeof mockPrismaService;
  let eventEmitter: typeof mockEventEmitter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClubsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ClubsService>(ClubsService);
    prisma = module.get(PrismaService);
    eventEmitter = module.get(EventEmitter2);
    jest.clearAllMocks();
  });

  // ── findAll ───────────────────────────────────────────────────────────────
  describe("findAll", () => {
    it("should return all clubs including their teams", async () => {
      const mockClubs = [{ id: "club-1", name: "HC Barcelona", teams: [] }];
      prisma.club.findMany.mockResolvedValue(mockClubs);

      const result = await service.findAll();

      expect(prisma.club.findMany).toHaveBeenCalledWith({
        include: {
          teams: true,
          admin: true,
        },
      });
      expect(result).toEqual(mockClubs);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a club with required fields", async () => {
      const input = { name: "HC Madrid", city: "Madrid", country: "Spain", adminId: "admin-1" };
      const mockClub = { id: "club-2", ...input };
      const mockAdmin = { id: "admin-1", role: "CLUB" };

      // Mock user lookup for validation
      prisma.user.findUnique.mockResolvedValue(mockAdmin);
      prisma.club.create.mockResolvedValue(mockClub);

      const result = await service.create(input);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "admin-1" } });
      expect(prisma.club.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          city: input.city,
          country: input.country,
          adminId: input.adminId,
          benefits: [],
        },
        include: { admin: true },
      });
      expect(result).toEqual(mockClub);
    });

    it("should create a club with optional location and throw if not admin", async () => {
      const input = { name: "HC Valencia", city: "Valencia", country: "Spain", adminId: "admin-2", location: "Polideportivo Norte" };
      const mockAdmin = { id: "admin-2", role: "PLAYER" };

      prisma.user.findUnique.mockResolvedValue(mockAdmin);

      await expect(service.create(input)).rejects.toThrow("must have the CLUB role");
    });
  });

  // ── inviteMember ──────────────────────────────────────────────────────────
  describe("inviteMember", () => {
    it("should create a PENDING membership invitation", async () => {
      const mockMember = { id: "member-1", clubId: "club-1", userId: "user-1", status: "PENDING" };
      prisma.clubMember.findFirst.mockResolvedValue(null); // user not a member yet
      prisma.clubMember.create.mockResolvedValue(mockMember);

      const result = await service.inviteMember("club-1", "user-1", "admin-1");

      expect(prisma.clubMember.create).toHaveBeenCalledWith({
        data: { clubId: "club-1", userId: "user-1", invitedById: "admin-1", status: "PENDING" },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith("club.invite_sent", {
        actorId: "admin-1",
        recipientId: "user-1",
        type: "CLUB_INVITE",
        entityId: "club-1",
      });
      expect(result).toEqual(mockMember);
    });

    it("should throw if user is already a member", async () => {
      // Guard against duplicate membership rows — data integrity check
      prisma.clubMember.findFirst.mockResolvedValue({ id: "member-existing" });

      await expect(service.inviteMember("club-1", "user-1", "admin-1")).rejects.toThrow(
        "User is already a member of this club"
      );
      expect(prisma.clubMember.create).not.toHaveBeenCalled();
    });
  });

  // ── acceptMembership ──────────────────────────────────────────────────────
  describe("acceptMembership", () => {
    it("should update membership status to ACTIVE", async () => {
      const mockMember = { id: "member-1", status: "ACTIVE" };
      prisma.clubMember.update.mockResolvedValue(mockMember);

      const result = await service.acceptMembership("member-1");

      expect(prisma.clubMember.update).toHaveBeenCalledWith({
        where: { id: "member-1" },
        data: { status: "ACTIVE" },
      });
      expect(result).toEqual(mockMember);
    });
  });
});
