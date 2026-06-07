import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma.service";
import * as bcrypt from "bcrypt";

/**
 * AuthService — handles all authentication logic:
 *  - Email/password login (validateUser + login)
 *  - OAuth login for Google (oauthLogin)
 *
 * SECURITY NOTES:
 *  - OAuth users have password = null. Never try to bcrypt.compare against null.
 *  - Always identify OAuth users first by (authProvider + socialId), then fall
 *    back to email to link pre-existing email/password accounts.
 */
@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  /**
   * Validates an email/password pair.
   * Returns the user if credentials match, or null if not.
   * SECURITY: Returns null (not throws) to avoid leaking whether email exists.
   */
  async validateUser(email: string, pass: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Guard: OAuth users have no password — reject plaintext login attempts.
    if (!user || !user.password) return null;
    const match = await bcrypt.compare(pass, user.password);
    if (match) return user;
    return null;
  }

  /**
   * Issues a signed JWT for an authenticated user.
   * Payload includes: sub (user ID), username, role.
   */
  async login(user: any) {
    const payload = { username: user.username, sub: user.id, role: user.role };
    return { access_token: this.jwtService.sign(payload) };
  }

  /**
   * Decodes and verifies the Bearer token from a GraphQL context's Authorization
   * header, returning the authenticated user's id and role — or null if the
   * header is missing or the token is invalid/expired.
   *
   * Used by resolvers that need to know "who's asking" (e.g. isLikedByCurrentUser,
   * follow/like/save mutations, requireSuperAdmin) without enforcing a hard guard.
   */
  getUserFromAuthHeader(authHeader?: string): { userId: string; role: string } | null {
    if (!authHeader?.startsWith("Bearer ")) return null;
    try {
      const payload = this.jwtService.verify(authHeader.slice(7));
      return { userId: payload.sub, role: payload.role };
    } catch {
      return null;
    }
  }

  /**
   * Handles OAuth login for Google.
   *
   * Flow:
   *  1. Look up user by (authProvider + socialId) → fastest path for returning users.
   *  2. If not found, look up by email → link OAuth provider to an existing email account.
   *  3. If still not found, create a new user (password = null, authProvider set).
   *
   * @param profile.email      Email from the provider
   * @param profile.displayName Human-readable name from the provider
   * @param profile.provider   'GOOGLE'
   * @param profile.socialId   The provider's unique user ID (Google: profile.id)
   */
  async oauthLogin(profile: {
    email?: string;
    displayName?: string;
    provider: "GOOGLE";
    socialId: string;
  }) {
    // Step 1: Look up by socialId + provider — fastest path for returning users.
    let user = await this.prisma.user.findFirst({
      where: {
        authProvider: profile.provider,
        socialId: profile.socialId,
      },
    });

    if (user) return this.login(user);

    // Step 2: Look up by email to link existing email/password account
    if (profile.email) {
      user = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (user) {
        // Link OAuth provider to existing account
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            authProvider: profile.provider,
            socialId: profile.socialId,
          },
        });
        return this.login(user);
      }
    }

    // Step 3: No existing user — require email to register
    if (!profile.email) {
      throw new UnauthorizedException(
        "Unable to authenticate: email is required to create a new account. " +
          "Please ensure you share your email when signing in.",
      );
    }

    // Generate a unique username from the email prefix
    const baseUsername = profile.email.split("@")[0];
    let username = baseUsername;
    let counter = 1;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    user = await this.prisma.user.create({
      data: {
        email: profile.email,
        username,
        name: profile.displayName || username,
        password: null, // OAuth users never have a password
        authProvider: profile.provider,
        socialId: profile.socialId,
      },
    });

    return this.login(user);
  }
}
