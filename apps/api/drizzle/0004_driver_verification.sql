CREATE TYPE "public"."document_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('CIN_FRONT', 'CIN_BACK', 'SELFIE', 'DRIVING_LICENCE', 'PROFESSIONAL_CARD', 'VEHICLE_REGISTRATION', 'INSURANCE', 'OPERATING_CARD', 'OPERATOR_AUTHORISATION', 'VEHICLE_PHOTO');--> statement-breakpoint
CREATE TYPE "public"."transport_type" AS ENUM('TAXI', 'LOUAGE', 'BUS');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('DRAFT', 'UNDER_REVIEW', 'VERIFIED', 'CHANGES_REQUESTED', 'REJECTED', 'EXPIRED', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "driver_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"type" "document_type" NOT NULL,
	"storage_key" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "document_status" DEFAULT 'PENDING' NOT NULL,
	"reason" text,
	"expires_on" date,
	"reminded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "driver_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "driver_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"legal_first_name" text NOT NULL,
	"legal_last_name" text NOT NULL,
	"cin_hmac" text NOT NULL,
	"cin_last4" text NOT NULL,
	"cin_encrypted" text NOT NULL,
	"transport_type" "transport_type" NOT NULL,
	"status" "verification_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_profiles_cin_hmac_unique" UNIQUE("cin_hmac")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"driver_user_id" uuid NOT NULL,
	"transport_type" "transport_type" NOT NULL,
	"plate_normalized" text NOT NULL,
	"plate_display" text NOT NULL,
	"model" text NOT NULL,
	"color" text NOT NULL,
	"seats" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_driver_user_id_unique" UNIQUE("driver_user_id"),
	CONSTRAINT "vehicles_plate_normalized_unique" UNIQUE("plate_normalized")
);
--> statement-breakpoint
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_user_id_driver_profiles_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."driver_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "driver_documents_driver_idx" ON "driver_documents" USING btree ("driver_user_id");--> statement-breakpoint
CREATE INDEX "driver_documents_sha_idx" ON "driver_documents" USING btree ("sha256");