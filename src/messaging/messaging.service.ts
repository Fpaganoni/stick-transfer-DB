import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_CONVERSATION_PARTICIPANTS = 20;

/**
 * Every operation takes the authenticated user's id and only touches
 * conversations that user participates in. Participants live in the
 * ConversationParticipant table (conversationId + userId).
 */
@Injectable()
export class MessagingService {
  constructor(private prisma: PrismaService) {}

  private async assertParticipant(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });
    if (!participant) {
      throw new ForbiddenException("You are not part of this conversation");
    }
  }

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: {
        participants: { include: { user: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getConversation(id: string, currentUserId: string) {
    await this.assertParticipant(id, currentUserId);
    return this.prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: { include: { user: true } },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { sender: true },
        },
      },
    });
  }

  async getMessages(conversationId: string, currentUserId: string) {
    await this.assertParticipant(conversationId, currentUserId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: { sender: true },
    });
  }

  /**
   * Starts (or returns the existing) conversation between the current user and
   * the given participants. The current user is always included.
   */
  async startConversation(currentUserId: string, participantIds: string[]) {
    const ids = Array.from(new Set([currentUserId, ...participantIds]));

    if (ids.length < 2) {
      throw new BadRequestException(
        "A conversation needs at least one other participant",
      );
    }
    if (ids.length > MAX_CONVERSATION_PARTICIPANTS) {
      throw new BadRequestException(
        `A conversation can have at most ${MAX_CONVERSATION_PARTICIPANTS} participants`,
      );
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    if (users.length !== ids.length) {
      throw new BadRequestException("One or more participants do not exist");
    }

    const candidates = await this.prisma.conversation.findMany({
      where: {
        AND: ids.map((userId) => ({ participants: { some: { userId } } })),
      },
      include: { participants: { include: { user: true } } },
    });
    const existing = candidates.find((c) => c.participants.length === ids.length);
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        isGroup: ids.length > 2,
        participants: { create: ids.map((userId) => ({ userId })) },
      },
      include: { participants: { include: { user: true } } },
    });
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ) {
    const text = content?.trim();
    if (!text) throw new BadRequestException("Message cannot be empty");
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      );
    }

    await this.assertParticipant(conversationId, senderId);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId, senderId, content: text },
        include: { sender: true },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
      this.prisma.conversationParticipant.updateMany({
        where: { conversationId, userId: { not: senderId } },
        data: { unreadCount: { increment: 1 } },
      }),
    ]);

    return message;
  }

  /** Marks a message as read by the current user (the recipient). */
  async markAsRead(messageId: string, currentUserId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, conversationId: true, senderId: true },
    });
    if (!message) throw new NotFoundException("Message not found");

    await this.assertParticipant(message.conversationId, currentUserId);

    // Senders do not "read" their own messages
    if (message.senderId === currentUserId) return true;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() },
    });

    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: message.conversationId,
        senderId: { not: currentUserId },
        isRead: false,
      },
    });
    await this.prisma.conversationParticipant.update({
      where: {
        conversationId_userId: {
          conversationId: message.conversationId,
          userId: currentUserId,
        },
      },
      data: { lastSeenMessageId: messageId, unreadCount },
    });

    return true;
  }
}
