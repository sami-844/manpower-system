import { Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { Actor } from "../common/actor";
import { parse, parseId } from "../common/validation";
import { checkSchema, ComplianceService, overrideSchema } from "./compliance.service";

@Controller("api")
export class ComplianceController {
  constructor(@Inject(ComplianceService) private readonly compliance: ComplianceService) {}

  @Post("compliance/check")
  @HttpCode(200)
  check(@Body() body: unknown) {
    return this.compliance.check(parse(checkSchema, body));
  }

  @Get("compliance/renewals")
  renewals() {
    return this.compliance.renewals();
  }

  @Post("workers/:id/overrides")
  addOverride(@Param("id") id: string, @Body() body: unknown, @Actor(true) actor: string) {
    return this.compliance.addOverride(parseId(id), parse(overrideSchema, body), actor);
  }

  @Get("dashboard/summary")
  summary() {
    return this.compliance.summary();
  }
}
