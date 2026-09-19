import { Controller, Get, Req, Res, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AuthService } from "./auth.service";

/**
 * AuthController — REST endpoints for OAuth authentication flows.
 *
 * These endpoints are intentionally outside GraphQL because OAuth requires
 * browser redirects (HTTP 302) and POST callbacks, which do not map to
 * GraphQL operations. Once authentication completes, a JWT is issued and
 * the client uses it for all subsequent GraphQL requests.
 *
 * Routes:
 *  GET  /auth/google           — Initiates Google OAuth2 flow (browser redirect)
 *  GET  /auth/google/callback  — Google redirects here after user consents
 *
 * After successful OAuth, the JWT is set as an httpOnly session cookie and
 * the user is redirected to /oauth-redirect with no sensitive data in the URL.
 * The frontend confirms the session by calling the `me` query.
 */
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  // ─── Google ────────────────────────────────────────────────────────────────

  /**
   * Initiates the Google OAuth2 consent screen.
   * Passport handles the redirect automatically — this handler is intentionally empty.
   */
  @Get("google")
  @UseGuards(AuthGuard("google"))
  async googleAuth() {
    // Passport redirects to Google — no body needed.
  }

  /**
   * Google OAuth2 callback endpoint.
   * Google redirects here after the user grants (or denies) consent.
   * Passport validates the code, calls GoogleStrategy.validate(), and
   * attaches the JWT result to req.user before reaching this handler.
   */
  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleAuthRedirect(@Req() req: any, @Res() res: any) {
    const token = (req.user as any)?.access_token ?? null;
    if (token) {
      this.authService.setAuthCookie(res, token);
    }
    // Redirect to the Next.js frontend OAuth landing page — no token in the URL,
    // the session cookie was just set above.
    // Frontend route: http://localhost:3000/oauth-redirect (app/[locale]/oauth-redirect/page.tsx)
    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/oauth-redirect`,
    );
  }
}
