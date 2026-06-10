import { Module } from "@nestjs/common";
import { ReportService } from "./report.service";
import { ReportResolver } from "./report.resolver";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  providers: [ReportService, ReportResolver, PrismaService],
  exports: [ReportService],
})
export class ReportModule {}
