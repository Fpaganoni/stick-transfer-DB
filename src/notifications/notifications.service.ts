import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { NotificationsGateway } from './notifications.gateway';

export interface CreateNotificationDto {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  entityId?: string;
  postId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async createNotification(data: CreateNotificationDto) {
    if (data.actorId === data.recipientId) return null;

    const notification = await this.prisma.notification.create({
      data,
      include: { actor: true },
    });

    this.gateway.sendNotification(data.recipientId, notification);
    return notification;
  }

  async getUserNotifications(userId: string, limit = 20, offset = 0) {
    return this.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      include: { actor: true },
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
  }

  async markAsRead(id: string) {
    await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return true;
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });
    return true;
  }

  async removeNotification(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: { recipientId: true },
    });

    if (!notification || notification.recipientId !== userId) {
      return false;
    }

    await this.prisma.notification.delete({ where: { id } });
    return true;
  }

  async clearAllNotifications(userId: string) {
    await this.prisma.notification.deleteMany({
      where: { recipientId: userId },
    });
    return true;
  }
}
