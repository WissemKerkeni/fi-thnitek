CREATE TYPE "public"."place_kind" AS ENUM('GOVERNORATE', 'DELEGATION', 'CITY', 'NEIGHBOURHOOD', 'LOUAGE_STATION', 'BUS_STATION', 'AIRPORT', 'LANDMARK');--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "place_kind" NOT NULL,
	"name_ar" text NOT NULL,
	"name_fr" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"parent_id" uuid,
	"governorate_code" text,
	"popularity" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"search_text" text NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE INDEX "places_location_gist" ON "places" USING gist ("location");--> statement-breakpoint
CREATE INDEX "places_search_trgm" ON "places" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "places_kind_idx" ON "places" USING btree ("kind");