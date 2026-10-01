import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { MessagingResolver } from "./messaging.resolver";

describe("MessagingResolver - authorization", () => {
  let resolver: MessagingResolver;
  let messagingService: any;
  let authService: any;
  const ctx = {};

  const asUser = (userId: string, role = "PLAYER") =>
    authService.getUserFromRequest.mockReturnValue({ userId, role });

  beforeEach(() => {
    messagingService = {
      getConversations: jest.fn(),
      getConversation: jest.fn(),
      getMessages: jest.fn(),
      startConversation: jest.fn(),
      sendMessage: jest.fn(),
      markAsRead: jest.fn(),
    };
    authService = { getUserFromRequest: jest.fn() };
    resolver = new MessagingResolver(messagingService, authService);
  });

  it.each([
    ["myConversations", () => resolver.myConversations(ctx)],
    ["conversation", () => resolver.conversation(ctx, "c1")],
    ["messages", () => resolver.messages(ctx, "c1")],
    ["startConversation", () => resolver.startConversation(ctx, ["u2"])],
    ["sendMessage", () => resolver.sendMessage(ctx, "c1", "hi")],
    ["markMessageAsRead", () => resolver.markMessageAsRead(ctx, "m1")],
  ])("%s requires authentication", async (_n, call) => {
    authService.getUserFromRequest.mockReturnValue(null);
    await expect(call()).rejects.toThrow(UnauthorizedException);
  });

  it("myConversations uses the session user and rejects a mismatching userId", async () => {
    asUser("u1");
    await resolver.myConversations(ctx);
    expect(messagingService.getConversations).toHaveBeenCalledWith("u1");

    await expect(resolver.myConversations(ctx, "victim")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("super admin cannot read other users' conversations by id spoofing", async () => {
    asUser("admin", "SUPERADMIN");
    await expect(resolver.myConversations(ctx, "victim")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("sendMessage uses the session user and rejects a mismatching senderId", async () => {
    asUser("u1");
    await resolver.sendMessage(ctx, "c1", "hola");
    expect(messagingService.sendMessage).toHaveBeenCalledWith("c1", "u1", "hola");

    await expect(resolver.sendMessage(ctx, "c1", "hola", "victim")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("passes the session user to participant-scoped operations", async () => {
    asUser("u1");
    await resolver.conversation(ctx, "c1");
    expect(messagingService.getConversation).toHaveBeenCalledWith("c1", "u1");
    await resolver.messages(ctx, "c1");
    expect(messagingService.getMessages).toHaveBeenCalledWith("c1", "u1");
    await resolver.startConversation(ctx, ["u2"]);
    expect(messagingService.startConversation).toHaveBeenCalledWith("u1", ["u2"]);
    await resolver.markMessageAsRead(ctx, "m1");
    expect(messagingService.markAsRead).toHaveBeenCalledWith("m1", "u1");
  });
});
