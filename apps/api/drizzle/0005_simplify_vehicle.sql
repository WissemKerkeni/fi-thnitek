ALTER TABLE "vehicles" ALTER COLUMN "seats" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN "model";--> statement-breakpoint
ALTER TABLE "vehicles" DROP COLUMN "color";