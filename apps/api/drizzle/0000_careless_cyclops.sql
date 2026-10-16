CREATE TYPE "public"."category" AS ENUM('food', 'shopping', 'transport', 'bills', 'income', 'travel', 'health', 'entertainment', 'subscriptions', 'transfers', 'other', 'uncategorized');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('llm', 'user', 'rule');--> statement-breakpoint
CREATE TYPE "public"."check_name" AS ENUM('schema_valid', 'totals_reconcile', 'date_range_sanity', 'duplicate_within_document', 'duplicate_across_documents', 'completeness');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'processing', 'needs_review', 'accepted', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('pdf_statement', 'image_receipt', 'csv_export', 'xlsx_export');--> statement-breakpoint
CREATE TYPE "public"."duplicate_resolution" AS ENUM('kept_both', 'merged', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."processing_stage" AS ENUM('extract', 'verify', 'promote');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('blocking', 'warning');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"document_type" "document_type" NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"status_detail" jsonb,
	"statement_period_start" date,
	"statement_period_end" date,
	"statement_total_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_user_file_hash_unique" UNIQUE("user_id","file_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "duplicate_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id_a" uuid NOT NULL,
	"transaction_id_b" uuid NOT NULL,
	"match_reason" text NOT NULL,
	"confidence" real NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolution" "duplicate_resolution",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extracted_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"date" date,
	"merchant" text,
	"description" text,
	"amount_cents" integer NOT NULL,
	"direction" "direction" NOT NULL,
	"account_hint" text,
	"category" "category" NOT NULL,
	"category_confidence" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"stage" "processing_stage" DEFAULT 'extract' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"extracted_transaction_id" uuid,
	"date" date,
	"merchant" text,
	"description" text,
	"amount_cents" integer NOT NULL,
	"direction" "direction" NOT NULL,
	"account" text,
	"category" "category" NOT NULL,
	"category_source" "category_source" DEFAULT 'llm' NOT NULL,
	"is_uncategorized" boolean DEFAULT false NOT NULL,
	"needs_date_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"check_name" "check_name" NOT NULL,
	"passed" boolean NOT NULL,
	"severity" "severity" NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_transaction_id_a_transactions_id_fk" FOREIGN KEY ("transaction_id_a") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_transaction_id_b_transactions_id_fk" FOREIGN KEY ("transaction_id_b") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extracted_transactions" ADD CONSTRAINT "extracted_transactions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "transactions" ADD CONSTRAINT "transactions_extracted_transaction_id_extracted_transactions_id_fk" FOREIGN KEY ("extracted_transaction_id") REFERENCES "public"."extracted_transactions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_user_status_idx" ON "documents" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_available_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_category_idx" ON "transactions" USING btree ("user_id","category");