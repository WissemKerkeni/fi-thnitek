CREATE TABLE "client_errors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"name" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"screen" text,
	"fatal" boolean NOT NULL,
	"install_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"app_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "client_errors_received_idx" ON "client_errors" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "client_errors_fingerprint_idx" ON "client_errors" USING btree ("fingerprint","received_at");