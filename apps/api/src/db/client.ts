import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export const DB = Symbol("DB");

export interface Database {
  orm: PostgresJsDatabase<typeof schema>;
  sql: postgres.Sql;
}

export function createDatabase(url = process.env.DATABASE_URL ?? "postgres://mms:mms@localhost:5432/mms_dev"): Database {
  // Return DATE columns as plain YYYY-MM-DD strings, never JS Dates.
  const sql = postgres(url, {
    max: 10,
    onnotice: () => {},
    types: { date: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v } },
  });
  return { sql, orm: drizzle(sql, { schema }) };
}
