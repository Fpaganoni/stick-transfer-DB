export const AUTH_COOKIE_NAME = "st_session";

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses JWT_EXPIRES_IN-style strings ("1h", "7d", "3600") into ms. Falls back to 1h. */
export function expiresInToMs(value: string | undefined): number {
  if (!value) return UNIT_MS.h;
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) return UNIT_MS.h;
  const amount = Number(match[1]);
  const unit = match[2] ? UNIT_MS[match[2]] : 1000;
  return amount * unit;
}

/**
 * SameSite=None+Secure is rejected by browsers over plain HTTP (dev/localhost).
 * NODE_ENV=development relaxes to Lax+non-Secure so local dev keeps working;
 * production always gets the strict cross-site-safe settings.
 */
export function authCookieOptions(maxAgeMs: number) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}
