import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { GoogleStrategy } from "./google.strategy";
import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";

/**
 * AuthModule — registers all authentication strategies and services.
 *
 * Strategies registered:
 *  - JwtStrategy    — validates Bearer tokens on protected GraphQL/REST endpoints
 *  - GoogleStrategy — handles Google OAuth2 flow (GET /auth/google)
 *
 * AuthService is exported so other modules can call login() if needed.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || "1h" },
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    PrismaService,
    {
      provide: GoogleStrategy,
      useFactory: (authService: AuthService) => {
        const clientID = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientID || !clientSecret) {
          console.warn(
            `[Auth] ⚠️  Google Sign In is DISABLED — missing env vars: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET\n` +
              `        Get them at: https://console.cloud.google.com → APIs & Services → Credentials`,
          );
          return null;
        }

        return new GoogleStrategy(authService);
      },
      inject: [AuthService],
    },
  ],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
