CREATE TYPE "public"."risk_flag_type" AS ENUM('MOCK_LOCATION', 'IMPOSSIBLE_JUMP', 'MULTI_ACCOUNT_DEVICE', 'NOBODY_THERE_CLUSTER');--> statement-breakpoint
CREATE TYPE "public"."session_end_reason" AS ENUM('MANUAL_STOP', 'LOCATION_OFF', 'PING_GAP', 'SPOOF_SUSPECTED', 'MAX_DURATION', 'BREAK_NOT_RESUMED', 'SUSPENDED', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."session_event_type" AS ENUM('STARTED', 'FULL_ON', 'FULL_OFF', 'BREAK_STARTED', 'RESUMED', 'HEADING_CHANGED', 'STILL_WORKING_PROMPTED', 'STILL_WORKING_CONFIRMED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."sharing_state" AS ENUM('SHARING', 'ON_BREAK', 'ENDED');--> statement-breakpoint
CREATE TABLE "driver_live_locations" (
	"driver_user_id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"transport_type" "transport_type" NOT NULL,
	"point" geography(Point,4326) NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"accuracy_m" real,
	"heading_deg" real,
	"speed_mps" real,
	"fix_ts" timestamp with time zone NOT NULL,
	"recent_fixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_flags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "risk_flag_type" NOT NULL,
	"session_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"type" "session_event_type" NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharing_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"transport_type" "transport_type" NOT NULL,
	"heading_to_place_id" uuid,
	"line_label" text,
	"state" "sharing_state" DEFAULT 'SHARING' NOT NULL,
	"is_full" boolean DEFAULT false NOT NULL,
	"break_started_at" timestamp with time zone,
	"break_until" timestamp with time zone,
	"break_reminded_at" timestamp with time zone,
	"breaks_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_fix_at" timestamp with time zone,
	"still_working_prompted_at" timestamp with time zone,
	"still_working_confirmed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"end_reason" "session_end_reason",
	"cooldown_applied" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "cooldown_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_live_locations" ADD CONSTRAINT "driver_live_locations_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_live_locations" ADD CONSTRAINT "driver_live_locations_session_id_sharing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sharing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_flags" ADD CONSTRAINT "risk_flags_session_id_sharing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sharing_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sharing_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sharing_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_sessions" ADD CONSTRAINT "sharing_sessions_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_sessions" ADD CONSTRAINT "sharing_sessions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_sessions" ADD CONSTRAINT "sharing_sessions_heading_to_place_id_places_id_fk" FOREIGN KEY ("heading_to_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_live_locations_point_gist" ON "driver_live_locations" USING gist ("point");--> statement-breakpoint
CREATE INDEX "risk_flags_user_idx" ON "risk_flags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_events_session_idx" ON "session_events" USING btree ("session_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "sharing_sessions_one_active" ON "sharing_sessions" USING btree ("driver_user_id") WHERE "sharing_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sharing_sessions_active_idx" ON "sharing_sessions" USING btree ("state") WHERE "sharing_sessions"."ended_at" IS NULL;--> statement-breakpoint
CREATE INDEX "sharing_sessions_driver_idx" ON "sharing_sessions" USING btree ("driver_user_id","started_at");