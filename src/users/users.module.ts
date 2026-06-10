import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";
import { UsersResolver } from "./users.resolver";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { UploadsModule } from "../uploads/uploads.module";
import { ClubsModule } from "../clubs/clubs.module";
import { SocialModule } from "../social/social.module";

@Module({
  imports: [AuthModule, UploadsModule, ClubsModule, SocialModule],
  providers: [UsersService, UsersResolver, PrismaService],
  exports: [UsersService],
})
export class UsersModule {}
