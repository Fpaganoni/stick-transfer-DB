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
 * Cookie attributes shared by set and clear: browsers only honor a deletion
 * when secure/sameSite/path match the cookie that was set, so clearing must
 * reuse these (without maxAge, which would override the expiry Express sets).
 *
 * SameSite=None+Secure is rejected by browsers over plain HTTP (dev/localhost).
 * Any non-production NODE_ENV relaxes to Lax+non-Secure so local dev keeps
 * working; production gets the strict cross-site-safe settings unless
 * AUTH_COOKIE_CROSS_SITE says otherwise (see isCrossSiteCookie).
 */
export function authCookieBaseOptions() {
  const crossSite = isCrossSiteCookie();
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: (crossSite ? "none" : "lax") as "none" | "lax",
    path: "/",
  };
}

/**
 * AUTH_COOKIE_CROSS_SITE=true|false overrides the NODE_ENV default so a
 * non-production deploy (staging) on its own domain can still use
 * SameSite=None+Secure. Any other value is ignored.
 */
function isCrossSiteCookie(): boolean {
  const override = process.env.AUTH_COOKIE_CROSS_SITE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.NODE_ENV === "production";
}

/** Attributes for setting the session cookie. */
export function authCookieOptions(maxAgeMs: number) {
  return { ...authCookieBaseOptions(), maxAge: maxAgeMs };
}
