import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma.service';
import { ClubsResolver } from './clubs.resolver';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [NotificationsModule, UploadsModule],
  providers: [ClubsService, PrismaService, ClubsResolver],
  exports: [ClubsService],
})
export class ClubsModule {}
