import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { MessagingService, MAX_MESSAGE_LENGTH } from "./messaging.service";
import { PrismaService } from "../prisma.service";

const mockPrismaService = {
  user: { findMany: jest.fn() },
  conversation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  conversationParticipant: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe("MessagingService", () => {
  let service: MessagingService;
  let prisma: typeof mockPrismaService;

  const asParticipant = () =>
    prisma.conversationParticipant.findUnique.mockResolvedValue({ id: "p1" });
  const asOutsider = () =>
    prisma.conversationParticipant.findUnique.mockResolvedValue(null);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
    prisma = module.get(PrismaService);
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((ops: any[]) => Promise.all(ops));
  });

  describe("getConversations", () => {
    it("filters by participant userId (not the participant row id)", async () => {
      prisma.conversation.findMany.mockResolvedValue([]);
      await service.getConversations("u1");
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { participants: { some: { userId: "u1" } } },
        }),
      );
    });
  });

  describe("getConversation / getMessages", () => {
    it("rejects non-participants", async () => {
      asOutsider();
      await expect(service.getConversation("c1", "intruder")).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getMessages("c1", "intruder")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });

    it("returns data to participants", async () => {
      asParticipant();
      prisma.conversation.findUnique.mockResolvedValue({ id: "c1" });
      prisma.message.findMany.mockResolvedValue([{ id: "m1" }]);
      await expect(service.getConversation("c1", "u1")).resolves.toEqual({ id: "c1" });
      await expect(service.getMessages("c1", "u1")).resolves.toEqual([{ id: "m1" }]);
      expect(prisma.conversationParticipant.findUnique).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: "c1", userId: "u1" } },
        select: { id: true },
      });
    });
  });

  describe("startConversation", () => {
    it("always includes the current user and creates participant rows", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.create.mockResolvedValue({ id: "c1" });

      await service.startConversation("u1", ["u2"]);

      expect(prisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            isGroup: false,
            participants: { create: [{ userId: "u1" }, { userId: "u2" }] },
          },
        }),
      );
    });

    it("returns the existing conversation with the exact same participants", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
      const existing = { id: "c9", participants: [{}, {}] };
      const biggerGroup = { id: "c10", participants: [{}, {}, {}] };
      prisma.conversation.findMany.mockResolvedValue([biggerGroup, existing]);

      await expect(service.startConversation("u1", ["u2"])).resolves.toBe(existing);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it("marks 3+ participants as a group", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "u2" }, { id: "u3" }]);
      prisma.conversation.findMany.mockResolvedValue([]);
      prisma.conversation.create.mockResolvedValue({ id: "c1" });
      await service.startConversation("u1", ["u2", "u3"]);
      expect(prisma.conversation.create.mock.calls[0][0].data.isGroup).toBe(true);
    });

    it("rejects a conversation with only yourself", async () => {
      await expect(service.startConversation("u1", ["u1"])).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects unknown or inactive participants", async () => {
      prisma.user.findMany.mockResolvedValue([{ id: "u1" }]);
      await expect(service.startConversation("u1", ["ghost"])).rejects.toThrow(
        "do not exist",
      );
    });
  });

  describe("sendMessage", () => {
    it("rejects non-participants", async () => {
      asOutsider();
      await expect(service.sendMessage("c1", "intruder", "hi")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it.each([["   "], [""]])("rejects empty content %p", async (content) => {
      await expect(service.sendMessage("c1", "u1", content)).rejects.toThrow(
        "cannot be empty",
      );
    });

    it("rejects oversized content", async () => {
      await expect(
        service.sendMessage("c1", "u1", "a".repeat(MAX_MESSAGE_LENGTH + 1)),
      ).rejects.toThrow("cannot exceed");
    });

    it("creates the message, bumps the conversation and unread counters", async () => {
      asParticipant();
      prisma.message.create.mockResolvedValue({ id: "m1" });

      const result = await service.sendMessage("c1", "u1", "  hola  ");

      expect(result).toEqual({ id: "m1" });
      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { conversationId: "c1", senderId: "u1", content: "hola" },
        }),
      );
      expect(prisma.conversationParticipant.updateMany).toHaveBeenCalledWith({
        where: { conversationId: "c1", userId: { not: "u1" } },
        data: { unreadCount: { increment: 1 } },
      });
    });
  });

  describe("markAsRead", () => {
    it("throws NotFound for a missing message", async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(service.markAsRead("nope", "u1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects non-participants", async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: "m1", conversationId: "c1", senderId: "u2",
      });
      asOutsider();
      await expect(service.markAsRead("m1", "intruder")).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it("does nothing when the sender marks their own message", async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: "m1", conversationId: "c1", senderId: "u1",
      });
      asParticipant();
      await expect(service.markAsRead("m1", "u1")).resolves.toBe(true);
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it("marks as read and recomputes the recipient's unread count", async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: "m1", conversationId: "c1", senderId: "u2",
      });
      asParticipant();
      prisma.message.count.mockResolvedValue(2);

      await expect(service.markAsRead("m1", "u1")).resolves.toBe(true);

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: "m1" },
        data: { isRead: true, readAt: expect.any(Date) },
      });
      expect(prisma.conversationParticipant.update).toHaveBeenCalledWith({
        where: { conversationId_userId: { conversationId: "c1", userId: "u1" } },
        data: { lastSeenMessageId: "m1", unreadCount: 2 },
      });
    });
  });
});
