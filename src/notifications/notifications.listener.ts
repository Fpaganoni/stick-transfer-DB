import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';

export interface NotificationEvent {
  actorId: string;
  recipientId: string;
  type: NotificationType;
  entityId?: string;
}

@Injectable()
export class NotificationsListener {
  constructor(private notificationsService: NotificationsService) {}

  @OnEvent('club.invite_sent')
  async handleClubInvite(event: NotificationEvent) {
    try {
      await this.notificationsService.createNotification(event);
    } catch {}
  }

  @OnEvent('social.follow_created')
  async handleNewFollower(event: NotificationEvent) {
    try {
      await this.notificationsService.createNotification(event);
    } catch {}
  }

  @OnEvent('social.like_created')
  async handleNewLike(event: NotificationEvent) {
    try {
      await this.notificationsService.createNotification(event);
    } catch {}
  }

  @OnEvent('job.application_received')
  async handleApplicationReceived(event: NotificationEvent) {
    try {
      await this.notificationsService.createNotification(event);
    } catch {}
  }

  @OnEvent('job.application_status_updated')
  async handleApplicationStatusUpdated(event: NotificationEvent) {
    try {
      await this.notificationsService.createNotification(event);
    } catch {}
  }
}
