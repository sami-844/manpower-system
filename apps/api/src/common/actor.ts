import { createParamDecorator, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Who is acting. In this first slice the caller sends `x-user`; it is replaced by the
 * Amazon Cognito identity (Spec §2) before any real data goes in.
 */
export const Actor = createParamDecorator((required: boolean | undefined, ctx: ExecutionContext): string => {
  const header = ctx.switchToHttp().getRequest<Request>().header("x-user")?.trim();
  if (header) return header;
  if (required) throw new UnauthorizedException("A named user is required for this action");
  return "anonymous";
});
