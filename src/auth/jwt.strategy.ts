import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AUTH_COOKIE_NAME } from './auth.constants';

/**
 * Reads the JWT from the httpOnly session cookie. Falls back to the
 * Authorization: Bearer header during the cookie-migration rollout —
 * drop the header extractor once all clients are confirmed on cookies.
 */
function cookieExtractor(req: Request): string | null {
  return req?.cookies?.[AUTH_COOKIE_NAME] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  /**
   * Same revocation rule as AuthService.resolveSession, for routes guarded by
   * the Passport JWT guard: a token behind the user's tokenVersion, or issued to
   * a deactivated/deleted user, is rejected. Tokens without `tv` count as 0.
   */
  async validate(payload: any) {
    const user = payload?.sub
      ? await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { tokenVersion: true, isActive: true },
        })
      : null;
    if (!user || user.isActive === false || user.tokenVersion !== (payload.tv ?? 0)) {
      throw new UnauthorizedException("Session expired");
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
