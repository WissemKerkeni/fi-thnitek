CREATE TYPE "public"."appeal_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."block_kind" AS ENUM('DRIVER', 'PASSENGER');--> statement-breakpoint
CREATE TYPE "public"."report_category" AS ENUM('NOBODY_THERE', 'FAKE_PROFILE', 'HARASSMENT', 'UNSAFE', 'SPAM', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_priority" AS ENUM('HIGH', 'NORMAL');--> statement-breakpoint
CREATE TYPE "public"."report_source" AS ENUM('DRIVER_MARKER', 'PASSENGER_MARKER', 'MY_REQUEST', 'MY_SESSION');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'ACTIONED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."sanction_type" AS ENUM('WARNING', 'REQUEST_PAUSE', 'SUSPENSION', 'BAN');--> statement-breakpoint
ALTER TYPE "public"."risk_flag_type" ADD VALUE 'REPORTS_CLUSTER';--> statement-breakpoint
CREATE TABLE "appeals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"sanction_id" uuid,
	"message" text NOT NULL,
	"status" "appeal_status" DEFAULT 'OPEN' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"blocker_user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"kind" "block_kind" NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."blocker_user_id" <> "blocks"."blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"target_user_id" uuid,
	"source" "report_source" NOT NULL,
	"category" "report_category" NOT NULL,
	"priority" "report_priority" NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"request_id" uuid,
	"session_id" uuid,
	"approx_at" timestamp with time zone,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"resolution_note" text,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sanctions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "sanction_type" NOT NULL,
	"reason" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"report_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "risk_flags" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_sanction_id_sanctions_id_fk" FOREIGN KEY ("sanction_id") REFERENCES "public"."sanctions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_request_id_passenger_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."passenger_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_session_id_sharing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sharing_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appeals_open_uq" ON "appeals" USING btree ("user_id") WHERE "appeals"."status" = 'OPEN';--> statement-breakpoint
CREATE UNIQUE INDEX "blocks_pair_uq" ON "blocks" USING btree ("blocker_user_id","blocked_user_id");--> statement-breakpoint
CREATE INDEX "blocks_blocked_idx" ON "blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "reports_queue_idx" ON "reports" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_reporter_idx" ON "reports" USING btree ("reporter_user_id","created_at");--> statement-breakpoint
CREATE INDEX "sanctions_user_idx" ON "sanctions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sanctions_live_idx" ON "sanctions" USING btree ("ends_at") WHERE "sanctions"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "risk_flags_open_idx" ON "risk_flags" USING btree ("created_at") WHERE "risk_flags"."reviewed_at" IS NULL;