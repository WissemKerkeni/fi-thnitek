CREATE TYPE "public"."request_status" AS ENUM('OPEN', 'MOVED_AWAY', 'LOCATION_LOST', 'NO_GPS_FIX', 'EXPIRED', 'CANCELLED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "passenger_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"passenger_user_id" uuid NOT NULL,
	"transport_types" "transport_type"[] NOT NULL,
	"destination_point" geography(Point,4326) NOT NULL,
	"destination_lat" double precision NOT NULL,
	"destination_lng" double precision NOT NULL,
	"destination_place_id" uuid,
	"seats" integer DEFAULT 1 NOT NULL,
	"note" text,
	"show_identity" boolean DEFAULT false NOT NULL,
	"status" "request_status" DEFAULT 'OPEN' NOT NULL,
	"anchor_point" geography(Point,4326),
	"anchor_lat" double precision,
	"anchor_lng" double precision,
	"anchor_accuracy_m" real,
	"visible_at" timestamp with time zone,
	"last_point" geography(Point,4326),
	"last_lat" double precision,
	"last_lng" double precision,
	"last_accuracy_m" real,
	"last_fix_at" timestamp with time zone,
	"last_ping_at" timestamp with time zone,
	"away_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"expiry_reminded_at" timestamp with time zone,
	"renew_count" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pickup_records" (
	"request_id" uuid NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"min_distance_m" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pickup_records_request_id_driver_user_id_pk" PRIMARY KEY("request_id","driver_user_id")
);
--> statement-breakpoint
ALTER TABLE "risk_flags" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "passenger_requests" ADD CONSTRAINT "passenger_requests_passenger_user_id_users_id_fk" FOREIGN KEY ("passenger_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passenger_requests" ADD CONSTRAINT "passenger_requests_destination_place_id_places_id_fk" FOREIGN KEY ("destination_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_records" ADD CONSTRAINT "pickup_records_request_id_passenger_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."passenger_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_records" ADD CONSTRAINT "pickup_records_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passenger_requests_one_open" ON "passenger_requests" USING btree ("passenger_user_id") WHERE "passenger_requests"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "passenger_requests_open_idx" ON "passenger_requests" USING btree ("status") WHERE "passenger_requests"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "passenger_requests_passenger_idx" ON "passenger_requests" USING btree ("passenger_user_id","created_at");--> statement-breakpoint
CREATE INDEX "passenger_requests_anchor_gist" ON "passenger_requests" USING gist ("anchor_point");