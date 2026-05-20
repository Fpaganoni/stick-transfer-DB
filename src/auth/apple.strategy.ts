import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-apple";
import { AuthService } from "./auth.service";

/**
 * AppleStrategy — Passport strategy for Sign in with Apple.
 *
 * Flow:
 *  1. User hits POST /auth/apple → Passport redirects to Apple signin page.
 *  2. Apple POSTs back to /auth/apple/callback with an authorization code + id_token.
 *  3. passport-apple exchanges the code and calls `validate()` with the decoded id_token.
 *  4. `validate()` delegates to AuthService.oauthLogin() and returns a JWT.
 *
 * ⚠️  APPLE QUIRK — Email is ONLY sent on the very first login.
 *     On all subsequent logins, Apple only sends the `sub` (socialId).
 *     This is why we store `socialId` in the database and use it as the
 *     primary lookup key in AuthService.oauthLogin().
 *
 * Required env vars:
 *  - APPLE_CLIENT_ID      — Your Service ID (e.g. com.yourapp.auth)
 *                           Apple Developer → Certificates, IDs & Profiles → Identifiers → Service IDs
 *  - APPLE_TEAM_ID        — 10-char Team ID shown in Apple Developer → Membership → Team ID
 *  - APPLE_KEY_ID         — Key ID of your private key
 *                           Apple Developer → Certificates, IDs & Profiles → Keys → Key Details
 *  - APPLE_PRIVATE_KEY    — Full content of the downloaded .p8 file (⚠️ only downloadable once!)
 *                           Set in .env as a single-line string with literal \n for newlines:
 *                           APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nABC123...\n-----END PRIVATE KEY-----"
 *  - APPLE_CALLBACK_URL   — Must match the Return URL registered in the Service ID config.
 *                           ⚠️ Apple requires HTTPS — use ngrok for local development.
 *                           e.g. https://your-ngrok.ngrok.io/auth/apple/callback (dev)
 *                                https://yourdomain.com/auth/apple/callback (prod)
 *
 * SECURITY:
 *  - The `idToken.sub` is Apple's stable, globally unique identifier for the user.
 *  - Never rely on Apple's email as primary key — it can be a relay address (Hide My Email).
 *  - Always verify the token via passport-apple (which uses Apple's JWKS endpoint internally).
 */
@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, "apple") {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.APPLE_CLIENT_ID || "",
      teamID: process.env.APPLE_TEAM_ID || "",
      keyID: process.env.APPLE_KEY_ID || "",
      // Apple's .p8 private key — replace literal \n with actual newlines
      privateKeyString: (process.env.APPLE_PRIVATE_KEY || "").replace(
        /\\n/g,
        "\n",
      ),
      callbackURL: process.env.APPLE_CALLBACK_URL || "",
      scope: ["name", "email"],
    });
  }

  /**
   * Called by Passport after Apple returns user data.
   *
   * @param _accessToken  Apple access token (not stored — we use our own JWT)
   * @param _refreshToken Apple refresh token
   * @param idToken       Decoded Apple JWT — contains sub (socialId) and email (1st login only)
   * @param profile       Apple profile — contains name (1st login only)
   * @param done          Passport callback
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    idToken: any,
    profile: any,
    done: (err: Error | null, user?: any) => void,
  ) {
    try {
      // `sub` is Apple's stable unique user identifier — always present
      const socialId: string | undefined = idToken?.sub;
      if (!socialId) {
        return done(
          new UnauthorizedException(
            "Apple Sign In did not return a valid user identifier (sub). " +
              "Please try again.",
          ),
          false,
        );
      }

      // email is only provided on the FIRST login — may be a Hide My Email relay address
      const email: string | undefined = idToken?.email;

      // name is only provided on the FIRST login via the profile object
      let displayName: string | undefined;
      if (profile?.name?.firstName || profile?.name?.lastName) {
        displayName = [profile.name.firstName, profile.name.lastName]
          .filter(Boolean)
          .join(" ");
      }

      const login = await this.authService.oauthLogin({
        email,
        displayName,
        provider: "APPLE",
        socialId,
      });

      done(null, login);
    } catch (err) {
      done(err, false);
    }
  }
}
