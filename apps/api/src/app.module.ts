import "reflect-metadata";
import { Controller, Get, Global, Inject, Module, type INestApplication, type OnApplicationShutdown } from "@nestjs/common";
import { AuditController } from "./audit/audit.controller";
import { AuditService } from "./audit/audit.service";
import { CLOCK, omanClock } from "./common/clock";
import { ComplianceController } from "./compliance/compliance.controller";
import { ComplianceService } from "./compliance/compliance.service";
import { createDatabase, DB, type Database } from "./db/client";
import { SitesModule } from "./sites/sites.module";
import { WorkersController } from "./workers/workers.controller";
import { WorkersService } from "./workers/workers.service";

@Controller("api/health")
class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  async health() {
    await this.db.sql`select 1`;
    return { status: "ok" };
  }
}

@Global()
@Module({
  providers: [
    { provide: DB, useFactory: () => createDatabase() },
    { provide: CLOCK, useValue: omanClock },
    AuditService,
  ],
  exports: [DB, CLOCK, AuditService],
})
class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.sql.end({ timeout: 5 });
  }
}

@Module({
  imports: [CoreModule, SitesModule],
  controllers: [HealthController, AuditController, WorkersController, ComplianceController],
  providers: [WorkersService, ComplianceService],
})
export class AppModule {}

/** Shared by main.ts and tests so both run the same HTTP setup. */
export function configureApp(app: INestApplication): void {
  app.enableCors({ origin: process.env.WEB_ORIGIN?.split(",") ?? true });
  app.enableShutdownHooks();
}
