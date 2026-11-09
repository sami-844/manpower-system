import { Body, Controller, Get, Inject, Injectable, Module, Post } from "@nestjs/common";
import { asc } from "drizzle-orm";
import { DOCUMENT_TYPES } from "@mms/core";
import { z } from "zod";
import { AuditService } from "../audit/audit.service";
import { Actor } from "../common/actor";
import { parse } from "../common/validation";
import { DB, type Database } from "../db/client";
import { sites } from "../db/schema";

export const createSiteSchema = z.object({
  code: z.string().trim().min(2).max(30),
  name: z.string().trim().min(2).max(120),
  clientName: z.string().trim().min(2).max(120),
  requiredDocuments: z.array(z.enum(DOCUMENT_TYPES)).default([]),
});

@Injectable()
export class SitesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.orm.select().from(sites).orderBy(asc(sites.name));
  }

  create(input: z.infer<typeof createSiteSchema>, actor: string) {
    return this.db.orm.transaction(async (tx) => {
      const [site] = await tx.insert(sites).values(input).returning();
      await this.audit.record(tx, { actor, action: "site.create", subjectType: "site", subjectId: site!.id, before: null, after: site });
      return site!;
    });
  }
}

@Controller("api/sites")
export class SitesController {
  constructor(@Inject(SitesService) private readonly sites: SitesService) {}

  @Get()
  async list() {
    return { items: await this.sites.list() };
  }

  @Post()
  create(@Body() body: unknown, @Actor() actor: string) {
    return this.sites.create(parse(createSiteSchema, body), actor);
  }
}

@Module({ controllers: [SitesController], providers: [SitesService], exports: [SitesService] })
export class SitesModule {}
