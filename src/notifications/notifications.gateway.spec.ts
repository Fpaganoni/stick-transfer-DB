import { AUTH_COOKIE_NAME } from "../auth/auth.constants";
import { allowRequestFromAllowedOrigin } from "../common/cors";
import { NotificationsGateway, userRoom } from "./notifications.gateway";

function buildClient(handshake: { headers?: Record<string, string>; auth?: Record<string, unknown> } = {}) {
  return {
    handshake: { headers: {}, auth: {}, ...handshake },
    data: {} as { userId?: string },
    join: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  };
}

/** Unsigned JWT-shaped token: the gateway only reads `exp` after AuthService verified the signature. */
function tokenExpiringAt(expSeconds: number | undefined): string {
  const payload = Buffer.from(JSON.stringify({ sub: "user-1", exp: expSeconds })).toString("base64url");
  return `header.${payload}.signature`;
}

describe("NotificationsGateway handshake hardening", () => {
  it("rejects cross-site WebSocket handshakes via allowRequest (CORS alone does not stop them)", () => {
    const options = Reflect.getMetadata("websockets:gateway_options", NotificationsGateway);

    expect(options.allowRequest).toBe(allowRequestFromAllowedOrigin);
    expect(options.cors.credentials).toBe(true);
    expect(options.cors.origin).not.toBe("*");
  });
});

describe("NotificationsGateway", () => {
  let authService: { getUserFromRequest: jest.Mock };
  let gateway: NotificationsGateway;

  const authenticateAs = (userId: string) =>
    authService.getUserFromRequest.mockReturnValue({ userId, role: "PLAYER" });

  beforeEach(() => {
    authService = { getUserFromRequest: jest.fn().mockReturnValue(null) };
    gateway = new NotificationsGateway(authService as any);
  });

  describe("handleConnection", () => {
    it("joins the verified user's own room using the session cookie", () => {
      authenticateAs("user-1");
      const client = buildClient({
        headers: { cookie: `theme=dark; ${AUTH_COOKIE_NAME}=jwt-token; other=1` },
      });

      gateway.handleConnection(client as any);

      expect(authService.getUserFromRequest).toHaveBeenCalledWith({
        cookies: { [AUTH_COOKIE_NAME]: "jwt-token" },
        headers: { authorization: undefined },
      });
      expect(client.join).toHaveBeenCalledWith(userRoom("user-1"));
      expect(client.data.userId).toBe("user-1");
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it("accepts an Authorization: Bearer header for non-browser clients", () => {
      authenticateAs("user-1");
      const client = buildClient({ headers: { authorization: "Bearer header-token" } });

      gateway.handleConnection(client as any);

      expect(authService.getUserFromRequest).toHaveBeenCalledWith({
        cookies: {},
        headers: { authorization: "Bearer header-token" },
      });
      expect(client.join).toHaveBeenCalledWith(userRoom("user-1"));
    });

    it("accepts handshake.auth.token (socket.io `auth` option) as a Bearer token", () => {
      authenticateAs("user-1");
      const client = buildClient({ auth: { token: "auth-token" } });

      gateway.handleConnection(client as any);

      expect(authService.getUserFromRequest).toHaveBeenCalledWith({
        cookies: {},
        headers: { authorization: "Bearer auth-token" },
      });
      expect(client.join).toHaveBeenCalledWith(userRoom("user-1"));
    });

    it("disconnects an anonymous socket without joining any room", () => {
      const client = buildClient();

      gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it("disconnects a socket whose token does not verify", () => {
      const client = buildClient({ headers: { cookie: `${AUTH_COOKIE_NAME}=forged` } });

      gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it("survives a malformed cookie header", () => {
      const client = buildClient({ headers: { cookie: `${AUTH_COOKIE_NAME}=%E0%A4%A; ;=` } });

      expect(() => gateway.handleConnection(client as any)).not.toThrow();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe("session expiry", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const nowSeconds = () => Math.floor(Date.now() / 1000);

    it("disconnects the socket when its JWT expires, not later", () => {
      authenticateAs("user-1");
      const client = buildClient({
        headers: { cookie: `${AUTH_COOKIE_NAME}=${tokenExpiringAt(nowSeconds() + 60)}` },
      });

      gateway.handleConnection(client as any);

      jest.advanceTimersByTime(59_000);
      expect(client.disconnect).not.toHaveBeenCalled();
      jest.advanceTimersByTime(2_000);
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it("stops the timer when the client disconnects first", () => {
      authenticateAs("user-1");
      const client = buildClient({
        headers: { cookie: `${AUTH_COOKIE_NAME}=${tokenExpiringAt(nowSeconds() + 60)}` },
      });
      gateway.handleConnection(client as any);

      const [event, onDisconnect] = client.on.mock.calls[0];
      expect(event).toBe("disconnect");
      onDisconnect();
      jest.advanceTimersByTime(120_000);

      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it("also covers Bearer and auth.token handshakes", () => {
      authenticateAs("user-1");
      const bearer = buildClient({
        headers: { authorization: `Bearer ${tokenExpiringAt(nowSeconds() + 10)}` },
      });
      const viaAuth = buildClient({ auth: { token: tokenExpiringAt(nowSeconds() + 10) } });

      gateway.handleConnection(bearer as any);
      gateway.handleConnection(viaAuth as any);
      jest.advanceTimersByTime(11_000);

      expect(bearer.disconnect).toHaveBeenCalledWith(true);
      expect(viaAuth.disconnect).toHaveBeenCalledWith(true);
    });

    it("does not crash or schedule anything for a token whose exp cannot be read", () => {
      authenticateAs("user-1");
      const client = buildClient({ headers: { cookie: `${AUTH_COOKIE_NAME}=opaque-token` } });

      expect(() => gateway.handleConnection(client as any)).not.toThrow();
      jest.advanceTimersByTime(10_000_000);

      expect(client.on).not.toHaveBeenCalled();
      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe("join message (kept for existing clients)", () => {
    it("never joins a room for an unauthenticated socket", () => {
      const client = buildClient();

      const result = gateway.handleJoin(client as any, { userId: "victim" });

      expect(result).toEqual({ status: "unauthorized" });
      expect(client.join).not.toHaveBeenCalled();
    });

    it("refuses to join another user's room even if the socket is authenticated", () => {
      const client = buildClient();
      client.data.userId = "user-1";

      const result = gateway.handleJoin(client as any, { userId: "victim" });

      expect(result).toEqual({ status: "forbidden" });
      expect(client.join).not.toHaveBeenCalled();
    });

    it.each([[{ userId: "user-1" }], [undefined], [{}]])(
      "re-joins only the verified own room (payload %p)",
      (payload) => {
        const client = buildClient();
        client.data.userId = "user-1";

        const result = gateway.handleJoin(client as any, payload as any);

        expect(result).toEqual({ status: "joined", userId: "user-1" });
        expect(client.join).toHaveBeenCalledWith(userRoom("user-1"));
      },
    );
  });

  describe("sendNotification", () => {
    it("emits to the recipient's room only", () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      (gateway as any).server = { to };

      gateway.sendNotification("user-1", { id: "n1" });

      expect(to).toHaveBeenCalledWith(userRoom("user-1"));
      expect(emit).toHaveBeenCalledWith("notification", { id: "n1" });
    });
  });
});
