import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder: path.resolve(here, "../../drizzle") });
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL ?? "postgres://mms:mms@localhost:5432/mms_dev";
  runMigrations(url).then(
    () => console.log("Migrations applied"),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
