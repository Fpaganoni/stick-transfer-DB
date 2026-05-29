import { Module } from "@nestjs/common";
import { ServeStaticModule } from "@nestjs/serve-static";
import { join } from "path";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { GqlThrottlerGuard } from "./common/guards/gql-throttler.guard";
import { GraphqlModule } from "./graphql.module";
import { PrismaService } from "./prisma.service";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ClubsModule } from "./clubs/clubs.module";
import { TeamsModule } from "./teams/teams.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { SearchModule } from "./search/search.module";
import { PaymentsModule } from "./payments/payments.module";
import { JobsModule } from "./jobs/jobs.module";
import { MessagingModule } from "./messaging/messaging.module";
import { ExploreModule } from "./explore/explore.module";
import { UploadsModule } from "./uploads/uploads.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    EventEmitterModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, "..", "public"),
      serveRoot: "/",
    }),
    GraphqlModule,
    AuthModule,
    UsersModule,
    ClubsModule,
    TeamsModule,
    NotificationsModule,
    SearchModule,
    PaymentsModule,
    JobsModule,
    MessagingModule,
    ExploreModule,
    UploadsModule,
    HealthModule,
  ],
  providers: [
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}
