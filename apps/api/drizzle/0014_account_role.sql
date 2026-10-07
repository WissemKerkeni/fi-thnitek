CREATE TYPE "public"."account_role" AS ENUM('PASSENGER', 'DRIVER');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "account_role";--> statement-breakpoint
-- ADR-225: accounts that already have a driver file are drivers; the others choose at their next launch.
UPDATE "users" SET "role" = 'DRIVER' WHERE "id" IN (SELECT "user_id" FROM "driver_profiles");
