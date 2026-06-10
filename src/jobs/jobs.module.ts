import { Module } from "@nestjs/common";
import { JobsService } from "./jobs.service";
import { JobsResolver } from "./jobs.resolver";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  providers: [JobsService, JobsResolver, PrismaService],
  exports: [JobsService],
})
export class JobsModule {}
