import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { PrismaService } from '../prisma.service';
import { ClubsResolver } from './clubs.resolver';
import { NotificationsModule } from '../notifications/notifications.module';
import { CloudinaryService } from '../integrations/cloudinary.service';

@Module({
  imports: [NotificationsModule],
  providers: [ClubsService, PrismaService, ClubsResolver, CloudinaryService],
  exports: [ClubsService],
})
export class ClubsModule {}
