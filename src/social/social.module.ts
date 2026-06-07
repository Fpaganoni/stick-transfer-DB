import { Module } from "@nestjs/common";
import { SocialService } from "./social.service";
import { SocialResolver } from "./social.resolver";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  providers: [SocialService, SocialResolver, PrismaService],
  exports: [SocialService],
})
export class SocialModule {}
