import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma.service';
import { ClubsResolver } from './clubs.resolver';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';
import { SocialModule } from '../social/social.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [NotificationsModule, UploadsModule, SocialModule, AuthModule],
  providers: [ClubsService, PrismaService, ClubsResolver],
  exports: [ClubsService],
})
export class ClubsModule {}
