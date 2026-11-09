import { BadRequestException } from "@nestjs/common";
import { isValidDate } from "@mms/core";
import { z, type ZodTypeAny } from "zod";

export const calendarDate = z.string().refine(isValidDate, { message: "Must be a real date in YYYY-MM-DD format" });
export const uuid = z.string().uuid();

export function parse<S extends ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      message: "Validation failed",
      issues: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return result.data;
}

export function parseId(id: string): string {
  return parse(uuid, id);
}
