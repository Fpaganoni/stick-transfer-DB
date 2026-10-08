import { Test, TestingModule } from "@nestjs/testing";
import { UsersService } from "./users.service";
import { PrismaService } from "../prisma.service";

// ── Mock completo de PrismaService ──────────────────────────────────────────
const mockPrismaService = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  trajectory: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  umpireCertification: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  clubMember: {
    findFirst: jest.fn(),
  },
};

describe("UsersService", () => {
  let service: UsersService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  // ── createUser ─────────────────────────────────────────────────────────────
  describe("createUser", () => {
    it("debería crear un usuario y hashear la contraseña", async () => {
      const mockUser = {
        id: "user-1",
        email: "lucia@test.com",
        name: "Lucía",
        username: "lucia_hk",
        role: "PLAYER",
      };
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.createUser({
        email: "lucia@test.com",
        name: "Lucía",
        username: "lucia_hk",
        password: "password123",
        role: "PLAYER",
      });

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      // Verifica que la contraseña NO se pase en texto plano
      const callArg = prisma.user.create.mock.calls[0][0].data;
      expect(callArg.password).not.toBe("password123");
      expect(callArg.email).toBe("lucia@test.com");
      expect(result).toEqual(mockUser);
    });

    it("debería crear un usuario sin contraseña (OAuth)", async () => {
      const mockUser = { id: "user-2", email: "oauth@test.com", name: "OAuth User" };
      prisma.user.create.mockResolvedValue(mockUser);

      await service.createUser({ email: "oauth@test.com", name: "OAuth User" });

      const callArg = prisma.user.create.mock.calls[0][0].data;
      expect(callArg.password).toBeUndefined();
    });
  });

  // ── findByEmail ────────────────────────────────────────────────────────────
  describe("findByEmail", () => {
    it("debería retornar usuario si existe el email", async () => {
      const mockUser = { id: "user-1", email: "lucia@test.com", name: "Lucía" };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByEmail("lucia@test.com");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "lucia@test.com" },
      });
      expect(result).toEqual(mockUser);
    });

    it("debería retornar null si el email no existe", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.findByEmail("noexiste@test.com");
      expect(result).toBeNull();
    });
  });

  // ── findById ───────────────────────────────────────────────────────────────
  describe("findById", () => {
    it("debería encontrar un usuario por ID", async () => {
      const mockUser = { id: "user-1", name: "Lucía" };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findById("user-1");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-1" } });
      expect(result).toEqual(mockUser);
    });

    it("debería retornar null si el ID no existe", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.findById("id-falso");
      expect(result).toBeNull();
    });
  });

  // ── findByUsername ─────────────────────────────────────────────────────────
  describe("findByUsername", () => {
    it("debería encontrar un usuario por username", async () => {
      const mockUser = { id: "user-1", username: "lucia_hk" };
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findByUsername("lucia_hk");

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: "lucia_hk" } });
      expect(result).toEqual(mockUser);
    });
  });

  // ── setAvatar ──────────────────────────────────────────────────────────────
  describe("setAvatar", () => {
    it("debería actualizar el avatar del usuario", async () => {
      const mockUser = { id: "user-1", avatar: "https://cdn.com/avatar.jpg" };
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.setAvatar("user-1", "https://cdn.com/avatar.jpg");

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { avatar: "https://cdn.com/avatar.jpg" },
      });
      expect(result).toEqual(mockUser);
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────
  describe("findAll", () => {
    it("debería retornar todos los usuarios ordenados por fecha", async () => {
      const mockUsers = [
        { id: "user-1", name: "Lucía" },
        { id: "user-2", name: "Pablo" },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(2);
    });
  });

  // ── findByRole ─────────────────────────────────────────────────────────────
  describe("findByRole", () => {
    it("debería retornar solo los jugadores", async () => {
      const mockPlayers = [{ id: "user-1", role: "PLAYER" }];
      prisma.user.findMany.mockResolvedValue(mockPlayers);

      const result = await service.findByRole("PLAYER");

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: "PLAYER" },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toEqual(mockPlayers);
    });
  });

  // ── updateUser (DB check mirrors) ──────────────────────────────────────────
  describe("updateUser - value validation", () => {
    it.each([
      [{ yearsOfExperience: -1 }, "yearsOfExperience"],
      [{ matchesOfficiated: -5 }, "matchesOfficiated"],
      [{ certificationYear: 1900 }, "certificationYear"],
      [{ certificationYear: 2200 }, "certificationYear"],
    ])("rejects %p", async (data, label) => {
      await expect(service.updateUser("user-1", data as any)).rejects.toThrow(label);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a trajectory that ends before it starts", async () => {
      await expect(
        service.updateUser("user-1", {
          trajectories: [
            { title: "t", organization: "o", period: "p", startDate: "2024-01-01", endDate: "2023-01-01" },
          ],
        }),
      ).rejects.toThrow("cannot end before it starts");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  // ── assertActiveClubMember ─────────────────────────────────────────────────
  describe("assertActiveClubMember", () => {
    it("passes when an ACTIVE membership exists", async () => {
      prisma.clubMember.findFirst.mockResolvedValue({ id: "m1" });
      await expect(
        service.assertActiveClubMember("u1", "c1"),
      ).resolves.toBeUndefined();
      expect(prisma.clubMember.findFirst).toHaveBeenCalledWith({
        where: { userId: "u1", clubId: "c1", status: "ACTIVE" },
        select: { id: true },
      });
    });

    it("throws Forbidden when there is no active membership", async () => {
      prisma.clubMember.findFirst.mockResolvedValue(null);
      await expect(service.assertActiveClubMember("u1", "c1")).rejects.toThrow(
        "active member",
      );
    });
  });

  // ── updateUser (umpire) ────────────────────────────────────────────────────
  describe("updateUser - umpire fields", () => {
    it("rejects umpire fields for non-umpire roles", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "PLAYER" });

      await expect(
        service.updateUser("user-1", { licenseLevel: "NACIONAL" }),
      ).rejects.toThrow("only available for the UMPIRE role");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("resets isVerified when license identity changes", async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: "UMPIRE",
        isVerified: true,
        licenseLevel: "NACIONAL",
        certifyingBody: "CAH",
        licenseNumber: "A-1",
      });
      prisma.user.update.mockResolvedValue({ id: "user-1" });

      await service.updateUser("user-1", { licenseNumber: "A-2" });

      expect(prisma.user.update.mock.calls[0][0].data.isVerified).toBe(false);
    });

    it("keeps isVerified when only non-identity umpire fields change", async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: "UMPIRE",
        isVerified: true,
        licenseLevel: "NACIONAL",
        certifyingBody: "CAH",
        licenseNumber: "A-1",
      });
      prisma.user.update.mockResolvedValue({ id: "user-1" });

      await service.updateUser("user-1", { matchesOfficiated: 120 });

      expect(prisma.user.update.mock.calls[0][0].data).not.toHaveProperty(
        "isVerified",
      );
    });

    it("replaces certifications", async () => {
      prisma.user.findUnique.mockResolvedValue({ role: "UMPIRE", isVerified: false });
      prisma.user.update.mockResolvedValue({ id: "user-1" });

      await service.updateUser("user-1", {
        umpireCertifications: [
          { name: "Nivel 2", issuer: "FIH", issuedAt: "2024-05-01" },
        ],
      });

      expect(prisma.umpireCertification.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
      expect(prisma.umpireCertification.createMany).toHaveBeenCalledTimes(1);
    });
  });

  // ── updateUser ─────────────────────────────────────────────────────────────
  describe("updateUser", () => {
    it("debería actualizar datos básicos del usuario", async () => {
      const mockUser = { id: "user-1", bio: "Nueva bio", cvUrl: "https://example.com/cv.pdf" };
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.updateUser("user-1", { bio: "Nueva bio", cvUrl: "https://example.com/cv.pdf" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { bio: "Nueva bio", cvUrl: "https://example.com/cv.pdf" },
      });
      expect(result).toEqual(mockUser);
    });

    it("debería actualizar trayectorias (borrado y recreado)", async () => {
      const mockUser = { id: "user-1" };
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.trajectory.deleteMany.mockResolvedValue({});
      prisma.trajectory.createMany.mockResolvedValue({});

      const mockTrajectories = [
        { title: "Jugador", organization: "Club A", period: "2020-2022" },
      ];

      await service.updateUser("user-1", {
        trajectories: mockTrajectories,
      });

      expect(prisma.trajectory.deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
      expect(prisma.trajectory.createMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateUser - profile images", () => {
    const originalUrl = process.env.CLOUDINARY_URL;
    const OWN_AVATAR =
      "https://res.cloudinary.com/demo/image/upload/v1/stick-transfer/users/user-1/avatar.webp";
    const LEGACY_AVATAR = "https://randomuser.me/api/portraits/men/1.jpg";

    beforeEach(() => {
      process.env.CLOUDINARY_URL = "cloudinary://k:s@demo";
      prisma.user.findUnique.mockResolvedValue({ avatar: LEGACY_AVATAR, coverImage: null });
      prisma.user.update.mockResolvedValue({ id: "user-1" });
    });

    afterEach(() => {
      if (originalUrl === undefined) delete process.env.CLOUDINARY_URL;
      else process.env.CLOUDINARY_URL = originalUrl;
    });

    const updatedData = () => prisma.user.update.mock.calls[0][0].data;

    it("rejects an avatar from a foreign host with IMAGE_URL_INVALID", async () => {
      await expect(
        service.updateUser("user-1", { avatar: "https://evil.com/x.png" }),
      ).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "avatar", code: "IMAGE_URL_INVALID" })],
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a coverImage from another user's folder", async () => {
      const other = OWN_AVATAR.replace("user-1", "user-2");
      await expect(service.updateUser("user-1", { coverImage: other })).rejects.toMatchObject({
        fields: [expect.objectContaining({ field: "coverImage", code: "IMAGE_URL_INVALID" })],
      });
    });

    it("saves an avatar uploaded to the user's own folder", async () => {
      await service.updateUser("user-1", { avatar: OWN_AVATAR });
      expect(updatedData()).toEqual(expect.objectContaining({ avatar: OWN_AVATAR }));
    });

    it("accepts the stored legacy avatar resent by the form", async () => {
      await service.updateUser("user-1", { avatar: LEGACY_AVATAR });
      expect(updatedData()).toEqual(expect.objectContaining({ avatar: LEGACY_AVATAR }));
    });

    it("removes the avatar when it is an empty string", async () => {
      await service.updateUser("user-1", { avatar: "" });
      expect(updatedData()).toEqual(expect.objectContaining({ avatar: null }));
    });

    it("does not read the user when no image is sent", async () => {
      await service.updateUser("user-1", { bio: "x" });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(updatedData()).not.toHaveProperty("avatar");
    });
  });
});
