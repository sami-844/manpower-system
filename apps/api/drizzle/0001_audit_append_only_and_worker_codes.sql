-- Audit events can never be changed or removed, even by application code with a bug.
CREATE OR REPLACE FUNCTION audit_events_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_change();
--> statement-breakpoint
-- Human-readable worker codes: W-000001, W-000002, ...
CREATE SEQUENCE IF NOT EXISTS worker_code_seq;
--> statement-breakpoint
ALTER TABLE workers ALTER COLUMN code SET DEFAULT 'W-' || lpad(nextval('worker_code_seq')::text, 6, '0');
