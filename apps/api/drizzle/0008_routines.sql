CREATE TYPE "public"."routine_kind" AS ENUM('ONE_OFF', 'WEEKLY');--> statement-breakpoint
CREATE TABLE "driver_routines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"transport_type" "transport_type" NOT NULL,
	"from_place_id" uuid NOT NULL,
	"to_place_id" uuid NOT NULL,
	"schedule_kind" "routine_kind" NOT NULL,
	"one_off_at" timestamp with time zone,
	"days_mask" smallint,
	"local_time" text,
	"seats" integer,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"stale_prompted_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_routines_schedule" CHECK (("driver_routines"."schedule_kind" = 'ONE_OFF' AND "driver_routines"."one_off_at" IS NOT NULL)
        OR ("driver_routines"."schedule_kind" = 'WEEKLY' AND "driver_routines"."days_mask" BETWEEN 1 AND 127 AND "driver_routines"."local_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'))
);
--> statement-breakpoint
ALTER TABLE "driver_routines" ADD CONSTRAINT "driver_routines_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_routines" ADD CONSTRAINT "driver_routines_from_place_id_places_id_fk" FOREIGN KEY ("from_place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_routines" ADD CONSTRAINT "driver_routines_to_place_id_places_id_fk" FOREIGN KEY ("to_place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_routines_driver_idx" ON "driver_routines" USING btree ("driver_user_id");--> statement-breakpoint
CREATE INDEX "driver_routines_to_idx" ON "driver_routines" USING btree ("to_place_id");