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
});
