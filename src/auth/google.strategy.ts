import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-google-oauth20";
import { AuthService } from "./auth.service";

/**
 * GoogleStrategy — Passport strategy for Google OAuth 2.0.
 *
 * Flow:
 *  1. User hits GET /auth/google → Passport redirects to Google consent screen.
 *  2. Google redirects to GET /auth/google/callback with a `code`.
 *  3. Passport exchanges the code for tokens and calls `validate()`.
 *  4. `validate()` delegates to AuthService.oauthLogin() and returns a JWT.
 *
 * Required env vars:
 *  - GOOGLE_CLIENT_ID      — from Google Cloud Console → APIs & Services → Credentials
 *  - GOOGLE_CLIENT_SECRET  — same location as above
 *  - OAUTH_CALLBACK_URL    — must match the "Authorized redirect URI" in Google Console
 *                            e.g. http://localhost:3000/auth/google/callback (dev)
 *                                 https://yourdomain.com/auth/google/callback (prod)
 *
 * SECURITY: The `profile.id` (Google's `sub`) is used as socialId.
 * This is a stable, globally unique identifier from Google — safer than email alone.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(private authService: AuthService) {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // SECURITY: Fail fast with a clear message if credentials are missing.
    // passport-google-oauth20 throws a cryptic error if clientID is empty —
    // this guard makes it actionable.
    if (!clientID || !clientSecret) {
      throw new Error(
        "[GoogleStrategy] Missing required environment variables: " +
          "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env\n" +
          "Get them at: https://console.cloud.google.com → APIs & Services → Credentials",
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL:
        process.env.OAUTH_CALLBACK_URL ||
        "http://localhost:4000/auth/google/callback",
      scope: ["email", "profile"],
    });
  }

  /**
   * Called by Passport after Google returns user data.
   * @param _accessToken  Google access token (not stored — we use our own JWT)
   * @param _refreshToken Google refresh token (not needed for our flow)
   * @param profile       Google profile including id, emails, displayName
   * @param done          Passport callback
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: Error | null, user?: any) => void,
  ) {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(
          new UnauthorizedException(
            "Google account did not return an email address. " +
              "Please ensure your Google account has a verified email.",
          ),
          false,
        );
      }

      const login = await this.authService.oauthLogin({
        email,
        displayName: profile.displayName,
        provider: "GOOGLE",
        socialId: profile.id, // Google's stable unique user ID
      });

      done(null, login);
    } catch (err) {
      done(err, false);
    }
  }
}
