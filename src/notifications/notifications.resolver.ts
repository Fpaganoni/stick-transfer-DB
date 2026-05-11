import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { NotificationsService } from './notifications.service';

@Resolver('Notification')
export class NotificationsResolver {
  constructor(private notificationsService: NotificationsService) {}

  @Query(() => [Object])
  async myNotifications(
    @Args('userId', { type: () => ID }) userId: string,
    @Args('limit', { nullable: true }) limit?: number,
    @Args('offset', { nullable: true }) offset?: number,
  ) {
    return this.notificationsService.getUserNotifications(userId, limit, offset);
  }

  @Query(() => Number)
  async unreadNotificationsCount(
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Mutation(() => Boolean)
  async markNotificationAsRead(
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.notificationsService.markAsRead(id);
  }

  @Mutation(() => Boolean)
  async markAllNotificationsAsRead(
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Mutation(() => Boolean)
  async removeNotification(
    @Args('id', { type: () => ID }) id: string,
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.notificationsService.removeNotification(id, userId);
  }

  @Mutation(() => Boolean)
  async clearAllNotifications(
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.notificationsService.clearAllNotifications(userId);
  }
}
