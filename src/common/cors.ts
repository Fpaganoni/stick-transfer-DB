const LOCAL_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

/**
 * Origins allowed to call the API (HTTP and websocket) with credentials.
 * Read on every call so FRONTEND_URL is honoured no matter when dotenv loads.
 */
export function getAllowedOrigins(): string[] {
  const origins = [...LOCAL_ORIGINS];
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL.replace(/\/+$/, ""));
  }
  return origins;
}

/**
 * Strict allow-list check (never reflects the request origin: with credentials
 * and SameSite=None a reflected origin would let any site read responses).
 * No Origin header means a non-browser client, where CORS does not apply.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === undefined || getAllowedOrigins().includes(origin);
}

/**
 * socket.io `allowRequest` hook. CORS headers do not stop a cross-site
 * WebSocket (browsers never apply CORS to it) and the session cookie is
 * SameSite=None, so without this check any website could open a socket with
 * the victim's cookie. Browsers always send Origin on the handshake, so a
 * present-but-unlisted Origin is rejected here.
 */
export function allowRequestFromAllowedOrigin(
  req: { headers: { origin?: string } },
  callback: (error: string | null | undefined, success: boolean) => void,
): void {
  callback(null, isAllowedOrigin(req.headers.origin));
}
