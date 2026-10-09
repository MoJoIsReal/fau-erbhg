-- Frozen base schema for the integration database. Do not edit.
--
-- These are the tables no numbered migration creates, as Drizzle generated
-- them from shared/schema.ts when this file was frozen (2026-10). The fixture
-- used to generate them from the *current* schema.ts on every run, so a column
-- added there was always present in CI, and a migration that forgot it (or a
-- schema change with no migration at all) passed CI and then failed against
-- Neon, which only ever receives the files in migrations/.
--
-- Now the fixture builds this file plus every migration, and
-- tests/integration/database.test.mjs compares the result with schema.ts. A
-- change to a table therefore needs a migration; this file stays as it is.
CREATE TABLE "blog_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"category" text DEFAULT 'news' NOT NULL,
	"published_date" text NOT NULL,
	"author" text,
	"show_on_homepage" boolean DEFAULT true,
	"notify_newsletter" boolean DEFAULT false,
	"newsletter_sent_at" text,
	"created_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);

CREATE TABLE "contact_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"responded_at" text,
	"responded_by" text,
	"response_message" text
);

CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"uploaded_by" text NOT NULL,
	"uploaded_at" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"cloudinary_url" text,
	"cloudinary_public_id" text
);

CREATE TABLE "email_domain_blacklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"category" text NOT NULL,
	"action" text NOT NULL,
	"suggested_fix" text,
	"description" text,
	"created_at" text NOT NULL,
	CONSTRAINT "email_domain_blacklist_domain_unique" UNIQUE("domain")
);

CREATE TABLE "event_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"attendee_count" integer DEFAULT 1,
	"comments" text,
	"language" text DEFAULT 'no',
	"children_names" text,
	"photo_slots" text,
	"food_contribution" text,
	"reminder_sent_at" text,
	"reminder_claimed_at" timestamp with time zone,
	"reminder_attempts" integer DEFAULT 0 NOT NULL,
	"registered_at" text,
	"cancel_token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL
);

CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"location" text NOT NULL,
	"custom_location" text,
	"max_attendees" integer,
	"current_attendees" integer DEFAULT 0,
	"registration_deadline" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"vigilo_signup" boolean DEFAULT false,
	"no_signup" boolean DEFAULT false,
	"notify_newsletter" boolean DEFAULT false,
	"newsletter_sent_at" text,
	"potluck" boolean DEFAULT false NOT NULL
);

CREATE TABLE "fau_board_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);

CREATE TABLE "kindergarten_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_email" text NOT NULL,
	"address" text NOT NULL,
	"opening_hours" text NOT NULL,
	"number_of_children" integer NOT NULL,
	"owner" text NOT NULL,
	"description" text NOT NULL,
	"styrer_name" text,
	"styrer_email" text,
	"updated_at" text NOT NULL
);

CREATE TABLE "site_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "site_settings_key_unique" UNIQUE("key")
);

CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"password_changed_at" text,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);

CREATE TABLE "yearly_calendar_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"school_year" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"entry_type" text NOT NULL,
	"week_number" integer,
	"week_number_end" integer,
	"weekday_start" integer,
	"weekday_end" integer,
	"date" text,
	"start_time" text,
	"end_time" text,
	"title" text NOT NULL,
	"description" text,
	"color" text,
	"category" text,
	"show_on_homepage" boolean DEFAULT false,
	"show_for_parents" boolean DEFAULT false,
	"notify_newsletter" boolean DEFAULT false,
	"newsletter_sent_at" text,
	"created_by" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);

ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;
CREATE INDEX "blog_posts_category_status_idx" ON "blog_posts" USING btree ("category","status");
CREATE INDEX "documents_category_idx" ON "documents" USING btree ("category");
CREATE INDEX "event_registrations_event_id_idx" ON "event_registrations" USING btree ("event_id");
CREATE INDEX "event_registrations_email_idx" ON "event_registrations" USING btree ("email");
CREATE UNIQUE INDEX "event_registrations_cancel_token_idx" ON "event_registrations" USING btree ("cancel_token");
CREATE INDEX "yearly_calendar_school_year_idx" ON "yearly_calendar_entries" USING btree ("school_year");
CREATE INDEX "yearly_calendar_year_month_idx" ON "yearly_calendar_entries" USING btree ("year","month");
