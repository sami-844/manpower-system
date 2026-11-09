import { Controller, Get, Inject, Query } from "@nestjs/common";
import { z } from "zod";
import { parse } from "../common/validation";
import { AuditService } from "./audit.service";

@Controller("api/audit")
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  async list(@Query() query: unknown) {
    const { subjectId } = parse(z.object({ subjectId: z.string().min(1) }), query);
    return { items: await this.audit.forSubject(subjectId) };
  }

  @Get("verify")
  verify() {
    return this.audit.verifyChain();
  }
}
