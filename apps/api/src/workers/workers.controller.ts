import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { Actor } from "../common/actor";
import { parse, parseId } from "../common/validation";
import {
  addDocumentSchema,
  addLeaveSchema,
  createWorkerSchema,
  listWorkersSchema,
  WorkersService,
} from "./workers.service";

@Controller("api")
export class WorkersController {
  constructor(@Inject(WorkersService) private readonly workers: WorkersService) {}

  @Get("workers")
  list(@Query() query: unknown) {
    return this.workers.list(parse(listWorkersSchema, query));
  }

  @Post("workers")
  create(@Body() body: unknown, @Actor() actor: string) {
    return this.workers.create(parse(createWorkerSchema, body), actor);
  }

  @Get("workers/:id")
  get(@Param("id") id: string) {
    return this.workers.get(parseId(id));
  }

  @Post("workers/:id/documents")
  addDocument(@Param("id") id: string, @Body() body: unknown, @Actor() actor: string) {
    return this.workers.addDocument(parseId(id), parse(addDocumentSchema, body), actor);
  }

  @Post("workers/:id/leave")
  addLeave(@Param("id") id: string, @Body() body: unknown, @Actor() actor: string) {
    return this.workers.addLeave(parseId(id), parse(addLeaveSchema, body), actor);
  }

  @Patch("documents/:id/verify")
  @HttpCode(200)
  verify(@Param("id") id: string, @Actor(true) actor: string) {
    return this.workers.verifyDocument(parseId(id), actor);
  }
}
