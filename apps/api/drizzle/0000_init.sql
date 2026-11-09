CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_id" text DEFAULT 'OM-01' NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text DEFAULT 'OM-01' NOT NULL,
	"worker_id" uuid NOT NULL,
	"code" text NOT NULL,
	"document_type" text,
	"valid_until" date NOT NULL,
	"approved_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text DEFAULT 'OM-01' NOT NULL,
	"worker_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text DEFAULT 'OM-01' NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"client_name" text NOT NULL,
	"required_documents" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text DEFAULT 'OM-01' NOT NULL,
	"worker_id" uuid NOT NULL,
	"type" text NOT NULL,
	"number" text,
	"issue_date" date,
	"expiry_date" date,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_documents_type_ck" CHECK ("worker_documents"."type" in ('passport','residence_visa','labour_card','civil_id','medical','driving_licence','trade_certificate','insurance')),
	CONSTRAINT "worker_documents_dates_ck" CHECK ("worker_documents"."issue_date" is null or "worker_documents"."expiry_date" is null or "worker_documents"."issue_date" <= "worker_documents"."expiry_date")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text DEFAULT 'OM-01' NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_ar" text,
	"nationality" text NOT NULL,
	"trade" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"phone" text,
	"date_of_birth" date,
	"joined_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_status_ck" CHECK ("workers"."status" in ('in_recruitment','available','deployed','on_leave','absconding_reported','exited'))
);
--> statement-breakpoint
ALTER TABLE "compliance_overrides" ADD CONSTRAINT "compliance_overrides_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_periods" ADD CONSTRAINT "leave_periods_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sites_code_uq" ON "sites" USING btree ("entity_id","code");--> statement-breakpoint
CREATE INDEX "worker_documents_worker_idx" ON "worker_documents" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_documents_expiry_idx" ON "worker_documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "workers_code_uq" ON "workers" USING btree ("entity_id","code");--> statement-breakpoint
CREATE INDEX "workers_name_idx" ON "workers" USING btree ("full_name");