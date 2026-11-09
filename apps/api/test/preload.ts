/**
 * Runs once before `bun test`: points the API at the test database and rebuilds its
 * schema from the real migrations, so tests always start from a known state.
 */
process.env.DATABASE_URL ??= "postgres://mms:mms@localhost:5432/mms_test";

import setup from "./global-setup";

await setup();
