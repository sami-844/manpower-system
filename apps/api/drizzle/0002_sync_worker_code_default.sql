-- Same default as 0001; recorded here so Drizzle's schema snapshot matches the database.
ALTER TABLE "workers" ALTER COLUMN "code" SET DEFAULT 'W-' || lpad(nextval('worker_code_seq')::text, 6, '0');