import { Module } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { AdminResolver } from "./admin.resolver";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  providers: [AdminService, AdminResolver, PrismaService],
})
export class AdminModule {}
