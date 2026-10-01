import { Resolver, Query, Mutation, Args, Context } from "@nestjs/graphql";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { MessagingService } from "./messaging.service";
import { AuthService } from "../auth/auth.service";

@Resolver("Conversation")
export class MessagingResolver {
  constructor(
    private messagingService: MessagingService,
    private authService: AuthService,
  ) {}

  private requireUser(context: any): { userId: string; role: string } {
    const user = this.authService.getUserFromRequest(context?.req);
    if (!user) throw new UnauthorizedException("Authentication required");
    return user;
  }

  /**
   * Legacy clients still send their own id; identity now comes from the
   * session, so a client-supplied id is only accepted when it matches.
   * No super admin bypass: private messages stay private.
   */
  private assertSameUserIfProvided(currentUserId: string, claimed?: string) {
    if (claimed && claimed !== currentUserId) {
      throw new ForbiddenException("You can only act on behalf of yourself");
    }
  }

  @Query(() => [Object])
  async myConversations(
    @Context() context: any,
    @Args("userId", { nullable: true }) userId?: string,
  ) {
    const currentUser = this.requireUser(context);
    this.assertSameUserIfProvided(currentUser.userId, userId);
    return this.messagingService.getConversations(currentUser.userId);
  }

  @Query(() => Object, { nullable: true })
  async conversation(@Context() context: any, @Args("id") id: string) {
    const currentUser = this.requireUser(context);
    return this.messagingService.getConversation(id, currentUser.userId);
  }

  @Query(() => [Object])
  async messages(
    @Context() context: any,
    @Args("conversationId") conversationId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.messagingService.getMessages(conversationId, currentUser.userId);
  }

  @Mutation(() => Object)
  async startConversation(
    @Context() context: any,
    @Args({ name: "participantIds", type: () => [String] })
    participantIds: string[],
  ) {
    const currentUser = this.requireUser(context);
    return this.messagingService.startConversation(
      currentUser.userId,
      participantIds,
    );
  }

  @Mutation(() => Object)
  async sendMessage(
    @Context() context: any,
    @Args("conversationId") conversationId: string,
    @Args("content") content: string,
    @Args("senderId", { nullable: true }) senderId?: string,
  ) {
    const currentUser = this.requireUser(context);
    this.assertSameUserIfProvided(currentUser.userId, senderId);
    return this.messagingService.sendMessage(
      conversationId,
      currentUser.userId,
      content,
    );
  }

  @Mutation(() => Boolean)
  async markMessageAsRead(
    @Context() context: any,
    @Args("messageId") messageId: string,
  ) {
    const currentUser = this.requireUser(context);
    return this.messagingService.markAsRead(messageId, currentUser.userId);
  }
}
