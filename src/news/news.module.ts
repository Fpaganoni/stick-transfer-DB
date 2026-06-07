import { Module } from "@nestjs/common";
import { NewsService } from "./news.service";
import { NewsResolver } from "./news.resolver";
import { PrismaService } from "../prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  providers: [NewsService, NewsResolver, PrismaService],
  exports: [NewsService],
})
export class NewsModule {}
