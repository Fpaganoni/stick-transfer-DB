import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
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
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  // Array form only: every operation is already a promise
  $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
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
    it("lists clubs of active owners, joining only the owning user (no members or teams)", async () => {
      const mockClubs = [{ id: "club-1", name: "HC Barcelona" }];
      prisma.club.findMany.mockResolvedValue(mockClubs);

      const result = await service.findAll();

      expect(prisma.club.findMany).toHaveBeenCalledWith({
        where: { user: { isActive: true, role: "CLUB" } },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip: 0,
        take: 50,
        include: { user: true },
      });
      expect(result).toEqual(mockClubs);
    });

    it("applies the requested limit and offset", async () => {
      prisma.club.findMany.mockResolvedValue([]);

      await service.findAll(25, 50);

      expect(prisma.club.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 25 }),
      );
    });

    it("rejects a limit above the maximum without querying", async () => {
      await expect(service.findAll(1000)).rejects.toThrow(BadRequestException);
      expect(prisma.club.findMany).not.toHaveBeenCalled();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────
  describe("findById", () => {
    it("joins only the owning user and returns null for an unknown club", async () => {
      prisma.club.findUnique.mockResolvedValueOnce({ id: "club-1" });
      prisma.club.findUnique.mockResolvedValueOnce(null);

      await expect(service.findById("club-1")).resolves.toEqual({ id: "club-1" });
      await expect(service.findById("ghost")).resolves.toBeNull();

      expect(prisma.club.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: "club-1" },
        include: { user: true },
      });
    });
  });

  describe("members", () => {
    const joined = new Date("2026-01-02T03:04:05.000Z");
    const member = (id: string, clubId: string) => ({
      id,
      clubId,
      roleInClub: "PLAYER",
      createdAt: joined,
      user: { id: `user-${id}` },
    });

    it("findMembersForClubs makes ONE query and groups members per club in key order", async () => {
      prisma.clubMember.findMany.mockResolvedValue([
        member("m1", "club-2"),
        member("m2", "club-1"),
        member("m3", "club-2"),
      ]);

      const result = await service.findMembersForClubs(["club-1", "club-2", "club-3"]);

      expect(prisma.clubMember.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.clubMember.findMany).toHaveBeenCalledWith({
        where: { clubId: { in: ["club-1", "club-2", "club-3"] } },
        include: { user: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      expect(result.map((list) => list.map((m) => m.id))).toEqual([["m2"], ["m1", "m3"], []]);
      expect(result[0][0]).toMatchObject({
        role: "PLAYER",
        joinedAt: "2026-01-02T03:04:05.000Z",
        user: { id: "user-m2" },
      });
    });

    it("loadMembers answers every club of one request with a single query", async () => {
      prisma.clubMember.findMany.mockResolvedValue([member("m1", "club-1")]);
      const ctx = {};

      const lists = await Promise.all(
        ["club-1", "club-2"].map((id) => service.loadMembers(ctx, id)),
      );

      expect(prisma.clubMember.findMany).toHaveBeenCalledTimes(1);
      expect(lists.map((list) => list.length)).toEqual([1, 0]);
    });

    it("loadMembers does not share results between requests", async () => {
      prisma.clubMember.findMany.mockResolvedValue([]);

      await service.loadMembers({}, "club-1");
      await service.loadMembers({}, "club-1");

      expect(prisma.clubMember.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("create", () => {
    it("should create a club whose id matches its owning user (CLUB role)", async () => {
      const input = {
        userId: "user-1",
        name: "HC Madrid",
        city: "Madrid",
        country: "ES",
        managedByFirstName: "Juan",
        managedByLastName: "Perez",
      };
      const mockUser = { id: "user-1", name: "HC Madrid User", role: "CLUB" };
      const mockClub = { id: "user-1", name: "HC Madrid", city: "Madrid", country: "ES" };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.club.findUnique.mockResolvedValue(null); // no existing club profile
      prisma.club.create.mockResolvedValue(mockClub);
      prisma.user.findMany.mockResolvedValue([]); // no superadmins to notify

      const result = await service.create(input);

      expect(prisma.club.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { name: "HC Madrid", city: "Madrid", country: "ES" },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.club.create).toHaveBeenCalledWith({
        data: {
          id: "user-1",
          managedByFirstName: input.managedByFirstName,
          managedByLastName: input.managedByLastName,
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
      const input = {
        userId: "user-2",
        name: "HC Valencia",
        city: "Valencia",
        country: "ES",
        managedByFirstName: "Juan",
        managedByLastName: "Perez",
      };
      const mockUser = { id: "user-2", name: "HC Valencia User", role: "PLAYER" };

      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.create(input)).rejects.toThrow("must have the CLUB role");
    });

    it("should throw if the user already has a club profile", async () => {
      const input = {
        userId: "user-3",
        name: "HC Sevilla",
        city: "Sevilla",
        country: "ES",
        managedByFirstName: "Juan",
        managedByLastName: "Perez",
      };
      const mockUser = { id: "user-3", name: "HC Sevilla User", role: "CLUB" };

      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.club.findUnique.mockResolvedValue({ id: "user-3" });

      await expect(service.create(input)).rejects.toThrow("already has a club profile");
    });

    it("should notify all superadmins that the new club is pending verification", async () => {
      const input = {
        userId: "user-4",
        name: "HC Bilbao",
        city: "Bilbao",
        country: "ES",
        managedByFirstName: "Juan",
        managedByLastName: "Perez",
      };
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

    describe("country", () => {
      const input = {
        userId: "user-5",
        name: "HC Lomas",
        city: "Lomas",
        managedByFirstName: "Juan",
        managedByLastName: "Perez",
      };

      it("stores the normalized code", async () => {
        prisma.user.findUnique.mockResolvedValue({ id: "user-5", name: "Lomas", role: "CLUB" });
        prisma.club.findUnique.mockResolvedValue(null);
        prisma.club.create.mockResolvedValue({ id: "user-5" });
        prisma.user.findMany.mockResolvedValue([]);

        await service.create({ ...input, country: " ar " });

        expect(prisma.user.update.mock.calls[0][0].data.country).toBe("AR");
      });

      it.each([["Argentina"], [""], ["🇦🇷 Argentina"]])(
        "rejects %p with COUNTRY_INVALID before writing anything",
        async (country) => {
          prisma.user.findUnique.mockResolvedValue({ id: "user-5", name: "Lomas", role: "CLUB" });
          prisma.club.findUnique.mockResolvedValue(null);
          await expect(service.create({ ...input, country })).rejects.toMatchObject({
            code: "VALIDATION_ERROR",
            fields: [expect.objectContaining({ field: "country", code: "COUNTRY_INVALID" })],
          });
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(prisma.user.update).not.toHaveBeenCalled();
          expect(prisma.club.create).not.toHaveBeenCalled();
        },
      );
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

  describe("updateClub - validation", () => {
    it("should reject an out-of-range foundedYear", async () => {
      await expect(service.updateClub("club-1", { foundedYear: 1500 })).rejects.toThrow(
        "foundedYear",
      );
      expect(prisma.club.update).not.toHaveBeenCalled();
    });
  });

  describe("updateClub - links and contact", () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue({ role: "CLUB", avatar: null, coverImage: null });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.club.update.mockResolvedValue({ id: "club-1" });
    });

    const fieldErrorsOf = async (data: Record<string, string>) => {
      try {
        await service.updateClub("club-1", data);
      } catch (error: any) {
        return error.fields as Array<{ field: string; code: string }>;
      }
      return undefined;
    };

    it.each([
      ["a javascript: website", { website: "javascript:alert(1)" }, "website", "URL_INVALID"],
      ["a data: website", { website: "data:text/html,x" }, "website", "URL_INVALID"],
      ["a website without scheme", { website: "example.com" }, "website", "URL_INVALID"],
      ["a malformed email", { email: "not-an-email" }, "email", "EMAIL_INVALID"],
      ["a phone with markup", { phone: "<script>" }, "phone", "PHONE_INVALID"],
    ])("rejects %s and writes nothing", async (_name, data, field, code) => {
      const errors = await fieldErrorsOf(data);

      expect(errors).toEqual([expect.objectContaining({ field, code })]);
      expect(prisma.club.update).not.toHaveBeenCalled();
    });

    it("reports every invalid contact field at once", async () => {
      const errors = await fieldErrorsOf({ website: "javascript:x", phone: "abc" });

      expect(errors?.map((e) => e.field)).toEqual(["website", "phone"]);
    });

    it("saves a valid website, email and phone", async () => {
      await service.updateClub("club-1", {
        website: "https://club.example.com",
        email: "info@club.example.com",
        phone: "+54 9 11 1234-5678",
      });

      expect(prisma.club.update.mock.calls[0][0].data).toMatchObject({
        website: "https://club.example.com",
        email: "info@club.example.com",
        phone: "+54 9 11 1234-5678",
      });
    });

    it("lets the club clear a contact field with an empty string", async () => {
      await service.updateClub("club-1", { website: "", email: "", phone: "" });

      expect(prisma.club.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("requestVerification - document url", () => {
    it.each([
      "javascript:alert(1)",
      "https://evil.example.com/doc.pdf",
      "http://res.cloudinary.com/demo/doc.pdf",
    ])("rejects %s before touching the club", async (documentUrl) => {
      await expect(service.requestVerification("club-1", documentUrl)).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "documentUrl", code: "DOCUMENT_URL_INVALID" })],
      });
      expect(prisma.club.findUnique).not.toHaveBeenCalled();
      expect(prisma.club.update).not.toHaveBeenCalled();
    });

    it.each([
      ["another club's folder", "https://res.cloudinary.com/demo/raw/upload/v1/stick-transfer/clubs/club-2/verification-doc.pdf"],
      ["a person's folder", "https://res.cloudinary.com/demo/raw/upload/v1/stick-transfer/users/club-1/cv.pdf"],
      ["a file outside the app folders", "https://res.cloudinary.com/demo/raw/upload/v1/doc.pdf"],
      ["a nested path under the club folder", "https://res.cloudinary.com/demo/raw/upload/v1/stick-transfer/clubs/club-1/x/y.pdf"],
    ])("rejects a document from %s: a club can only present its own", async (_label, documentUrl) => {
      await expect(service.requestVerification("club-1", documentUrl)).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "documentUrl", code: "DOCUMENT_URL_INVALID" })],
      });
      expect(prisma.club.update).not.toHaveBeenCalled();
    });

    it("stores a Cloudinary document", async () => {
      prisma.club.findUnique.mockResolvedValue({ id: "club-1", isVerified: false, verificationStatus: "NONE" });
      prisma.club.update.mockResolvedValue({ id: "club-1" });
      const url = "https://res.cloudinary.com/demo/raw/upload/v1/stick-transfer/clubs/club-1/verification-doc.pdf";

      await service.requestVerification("club-1", url);

      expect(prisma.club.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { verificationStatus: "PENDING", verificationDoc: url },
        }),
      );
    });
  });

  describe("updateClub - images and location", () => {
    const originalUrl = process.env.CLOUDINARY_URL;
    const OWN_LOGO =
      "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/clubs/club-1/logo.png";
    const OWN_USER_AVATAR =
      "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/users/club-1/avatar.png";
    const LEGACY_COVER = "https://images.unsplash.com/photo-1";

    beforeEach(() => {
      process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
      prisma.user.findUnique.mockResolvedValue({
        role: "CLUB",
        avatar: null,
        coverImage: LEGACY_COVER,
      });
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.club.update.mockResolvedValue({ id: "club-1" });
    });

    afterEach(() => {
      if (originalUrl === undefined) delete process.env.CLOUDINARY_URL;
      else process.env.CLOUDINARY_URL = originalUrl;
    });

    const userData = () => prisma.user.update.mock.calls[0][0].data;

    it("saves a logo uploaded to the club's own folder as the owner's avatar", async () => {
      await service.updateClub("club-1", { logo: OWN_LOGO });
      expect(userData()).toEqual(expect.objectContaining({ avatar: OWN_LOGO }));
      expect(userData()).not.toHaveProperty("logo");
      expect(prisma.club.update.mock.calls[0][0].data).not.toHaveProperty("logo");
    });

    it("also accepts a logo from the owner's users folder (same id)", async () => {
      await service.updateClub("club-1", { logo: OWN_USER_AVATAR });
      expect(userData()).toEqual(expect.objectContaining({ avatar: OWN_USER_AVATAR }));
    });

    it("rejects a logo from a foreign host with IMAGE_URL_INVALID on field logo", async () => {
      await expect(
        service.updateClub("club-1", { logo: "https://evil.com/x.png" }),
      ).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "logo", code: "IMAGE_URL_INVALID" })],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a logo from another club's folder", async () => {
      const other = OWN_LOGO.replace("club-1", "club-2");
      await expect(service.updateClub("club-1", { logo: other })).rejects.toMatchObject({
        fields: [expect.objectContaining({ code: "IMAGE_URL_INVALID" })],
      });
    });

    it("accepts the stored legacy coverImage resent by the form", async () => {
      await service.updateClub("club-1", { coverImage: LEGACY_COVER });
      expect(userData()).toEqual(expect.objectContaining({ coverImage: LEGACY_COVER }));
    });

    it("rejects a new coverImage that is not in the club's folder", async () => {
      await expect(
        service.updateClub("club-1", { coverImage: "https://images.unsplash.com/photo-2" }),
      ).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "coverImage" })],
      });
    });

    it("removes the image when logo is an empty string", async () => {
      await service.updateClub("club-1", { logo: "" });
      expect(userData()).toEqual(expect.objectContaining({ avatar: null }));
    });

    it("always reads the target to check it is a CLUB, even when no image is sent", async () => {
      await service.updateClub("club-1", { name: "New" });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "club-1" },
        select: { role: true, avatar: true, coverImage: true },
      });
    });

    it.each([[null], [{ role: "PLAYER", avatar: null, coverImage: null }]])(
      "fails with NotFound when the target is missing or not a CLUB (%p)",
      async (target) => {
        prisma.user.findUnique.mockResolvedValue(target);
        await expect(service.updateClub("club-1", { logo: OWN_LOGO })).rejects.toThrow(
          NotFoundException,
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it("saves city and the normalized country code on the owner user", async () => {
      await service.updateClub("club-1", { city: " Madrid ", country: "es" });
      expect(userData()).toEqual(expect.objectContaining({ city: "Madrid", country: "ES" }));
    });

    it.each([["Spain"], [""], ["   "]])(
      "rejects country %p with COUNTRY_INVALID",
      async (country) => {
        await expect(service.updateClub("club-1", { country })).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          fields: [expect.objectContaining({ field: "country", code: "COUNTRY_INVALID" })],
        });
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it.each(["", "   "])("rejects a blank city %p with a 400 validation error", async (city) => {
      await expect(service.updateClub("club-1", { city })).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        fields: [expect.objectContaining({ field: "city", code: "FIELD_REQUIRED" })],
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("ignores null city/country instead of nulling required columns", async () => {
      await service.updateClub("club-1", { name: "New", city: null, country: null });
      expect(userData()).not.toHaveProperty("city");
      expect(userData()).not.toHaveProperty("country");
    });
  });

  // ── acceptMembership ──────────────────────────────────────────────────────
  describe("acceptMembership", () => {
    it("should update membership status to ACTIVE for the invited user", async () => {
      const mockMember = { id: "member-1", status: "ACTIVE" };
      prisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "user-1", status: "PENDING",
      });
      prisma.clubMember.update.mockResolvedValue(mockMember);

      const result = await service.acceptMembership("member-1", "user-1");

      expect(prisma.clubMember.update).toHaveBeenCalledWith({
        where: { id: "member-1" },
        data: { status: "ACTIVE" },
      });
      expect(result).toEqual(mockMember);
    });

    it("should reject someone other than the invited user", async () => {
      prisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "user-1", status: "PENDING",
      });

      await expect(service.acceptMembership("member-1", "attacker")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.clubMember.update).not.toHaveBeenCalled();
    });

    it("should reject when the invitation is not pending", async () => {
      prisma.clubMember.findUnique.mockResolvedValue({
        id: "member-1", userId: "user-1", status: "REJECTED",
      });

      await expect(service.acceptMembership("member-1", "user-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.clubMember.update).not.toHaveBeenCalled();
    });

    it("should throw NotFound for an unknown membership", async () => {
      prisma.clubMember.findUnique.mockResolvedValue(null);

      await expect(service.acceptMembership("nope", "user-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
