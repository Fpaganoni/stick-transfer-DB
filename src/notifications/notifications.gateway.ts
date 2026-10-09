import {
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { AUTH_COOKIE_NAME } from '../auth/auth.constants';
import { allowRequestFromAllowedOrigin, isAllowedOrigin } from '../common/cors';

/** Private room of one user; sockets only ever join the room of their verified identity. */
export const userRoom = (userId: string) => `user_${userId}`;

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined; // malformed escape sequence: treat as no cookie
    }
  }
  return undefined;
}

/** setTimeout overflows (fires immediately) above 2^31-1 ms. */
const MAX_TIMER_MS = 2_147_483_647;

/** `exp` of an already-verified JWT, in ms; undefined when it cannot be read. */
function tokenExpiryMs(token: string | undefined): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token?.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

@WebSocketGateway({
  cors: {
    // Strict allow-list (credentials are sent with the handshake), never '*'
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) =>
      callback(null, isAllowedOrigin(origin)),
    credentials: true,
  },
  // CORS does not apply to WebSockets and the session cookie is SameSite=None:
  // without this any site could open a socket as the logged-in victim (CSWSH).
  allowRequest: allowRequestFromAllowedOrigin,
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly authService: AuthService) {}

  afterInit() {
    console.log('WebSocket gateway initialized');
  }

  /**
   * Identity comes from the handshake (session cookie, Bearer header or the
   * socket.io `auth.token` option), verified like any other request. Anonymous
   * or forged sockets are dropped before they can join a room.
   */
  handleConnection(client: Socket) {
    const { headers, auth } = client.handshake;
    const cookie = readCookie(headers.cookie, AUTH_COOKIE_NAME);
    const authToken = typeof auth?.token === 'string' ? auth.token : undefined;
    const authorization = headers.authorization ?? (authToken ? `Bearer ${authToken}` : undefined);

    const user = this.authService.getUserFromRequest({
      cookies: cookie ? { [AUTH_COOKIE_NAME]: cookie } : {},
      headers: { authorization },
    });
    if (!user) {
      client.disconnect(true);
      return;
    }
    // Same precedence as AuthService.getUserFromRequest: cookie first, then Bearer
    const rawToken = cookie ?? (authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined);

    client.data.userId = user.userId;
    client.join(userRoom(user.userId));
    this.disconnectWhenTokenExpires(client, rawToken);
  }

  /**
   * The JWT is only verified at connect time; without this a socket would keep
   * receiving private notifications for as long as it stays open.
   */
  private disconnectWhenTokenExpires(client: Socket, rawToken: string | undefined) {
    const expiresAt = tokenExpiryMs(rawToken);
    if (expiresAt === undefined) return;

    const timer = setTimeout(
      () => client.disconnect(true),
      Math.min(Math.max(expiresAt - Date.now(), 0), MAX_TIMER_MS),
    );
    timer.unref?.();
    client.on('disconnect', () => clearTimeout(timer));
  }

  sendNotification(toUserId: string, payload: any) {
    this.server.to(userRoom(toUserId)).emit('notification', payload);
  }

  /**
   * Kept so existing clients that still emit `join` keep working. The payload
   * is never trusted: the socket can only (re)join its own verified room.
   */
  @SubscribeMessage('join')
  handleJoin(client: Socket, payload?: { userId?: string }) {
    const verifiedUserId: string | undefined = client.data.userId;
    if (!verifiedUserId) return { status: 'unauthorized' };
    if (payload?.userId && payload.userId !== verifiedUserId) return { status: 'forbidden' };

    client.join(userRoom(verifiedUserId));
    return { status: 'joined', userId: verifiedUserId };
  }
}
