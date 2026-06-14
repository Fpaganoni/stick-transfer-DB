import { Test, TestingModule } from "@nestjs/testing";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ClubsService } from "./clubs.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  club: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  clubMember: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
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
      const mockClubs = [{ id: "club-1", name: "HC Barcelona", teams: [], clubMembers: [] }];
      prisma.club.findMany.mockResolvedValue(mockClubs);

      const result = await service.findAll();

      expect(prisma.club.findMany).toHaveBeenCalledWith({
        include: {
          teams: true,
          user: true,
          clubMembers: {
            include: { user: true },
          },
        },
      });
      expect(result).toEqual([{ ...mockClubs[0], members: [] }]);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe("create", () => {
    it("should create a club whose id matches its owning user (CLUB role)", async () => {
      const input = { userId: "user-1", name: "HC Madrid", city: "Madrid", country: "Spain" };
      const mockUser = { id: "user-1", name: "HC Madrid User", role: "CLUB" };
      const mockClub = { id: "user-1", name: "HC Madrid", city: "Madrid", country: "Spain" };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.club.findUnique.mockResolvedValue(null); // no existing club profile
      prisma.club.create.mockResolvedValue(mockClub);
      prisma.user.findMany.mockResolvedValue([]); // no superadmins to notify

      const result = await service.create(input);

      expect(prisma.club.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(prisma.club.create).toHaveBeenCalledWith({
        data: {
          id: "user-1",
          name: input.name,
          city: input.city,
          country: input.country,
          benefits: [],
          instagram: undefined,
          twitter: undefined,
          facebook: undefined,
          tiktok: undefined,
        },
        include: { user: true },
      });
      expect(result).toEqual(mockClub);
    });

    it("should throw if the user does not have the CLUB role", async () => {
      const input = { userId: "user-2", name: "HC Valencia", city: "Valencia", country: "Spain" };
      const mockUser = { id: "user-2", name: "HC Valencia User", role: "PLAYER" };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(input)).rejects.toThrow("must have the CLUB role");
    });

    it("should throw if the user already has a club profile", async () => {
      const input = { userId: "user-3", name: "HC Sevilla", city: "Sevilla", country: "Spain" };
      const mockUser = { id: "user-3", name: "HC Sevilla User", role: "CLUB" };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.club.findUnique.mockResolvedValue({ id: "user-3" });

      await expect(service.create(input)).rejects.toThrow("already has a club profile");
    });

    it("should notify all superadmins that the new club is pending verification", async () => {
      const input = { userId: "user-4", name: "HC Bilbao", city: "Bilbao", country: "Spain" };
      const mockUser = { id: "user-4", name: "HC Bilbao User", role: "CLUB" };
      const mockClub = { id: "user-4", name: "HC Bilbao" };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.club.findUnique.mockResolvedValue(null);
      prisma.club.create.mockResolvedValue(mockClub);
      prisma.user.findMany.mockResolvedValue([{ id: "superadmin-1" }]);

      await service.create(input);

      expect(eventEmitter.emit).toHaveBeenCalledWith("club.pending_verification", {
        actorId: "user-4",
        recipientId: "superadmin-1",
        type: "CLUB_PENDING_VERIFICATION",
        entityId: "user-4",
      });
    });
  });

  // ── verifyClub ────────────────────────────────────────────────────────────
  describe("verifyClub", () => {
    it("should mark the club as verified and notify its owner", async () => {
      const mockClub = { id: "club-1", isVerified: false };
      const mockUpdatedClub = { id: "club-1", isVerified: true, verificationStatus: "VERIFIED" };

      prisma.club.findUnique.mockResolvedValue(mockClub);
      prisma.club.update.mockResolvedValue(mockUpdatedClub);

      const result = await service.verifyClub("club-1", "superadmin-1");

      expect(prisma.club.update).toHaveBeenCalledWith({
        where: { id: "club-1" },
        data: { isVerified: true, verificationStatus: "VERIFIED" },
        include: { user: true },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith("club.verified", {
        actorId: "superadmin-1",
        recipientId: "club-1",
        type: "CLUB_VERIFIED",
        entityId: "club-1",
      });
      expect(result).toEqual(mockUpdatedClub);
    });

    it("should throw if club is already verified", async () => {
      prisma.club.findUnique.mockResolvedValue({ id: "club-1", isVerified: true });

      await expect(service.verifyClub("club-1", "superadmin-1")).rejects.toThrow("already verified");
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
