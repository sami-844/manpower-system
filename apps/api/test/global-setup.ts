import postgres from "postgres";
import { runMigrations } from "../src/db/migrate";

/** Fresh schema for every test run, built only from the real migrations. */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "postgres://mms:mms@localhost:5432/mms_test";
  if (!url.includes("test")) throw new Error(`Refusing to reset a non-test database: ${url}`);
  const sql = postgres(url, { onnotice: () => {} });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await sql.end();
  await runMigrations(url);
}
