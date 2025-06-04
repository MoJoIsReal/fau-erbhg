import { db } from './db';
import { sql } from 'drizzle-orm';

export async function initializeDatabase() {
  try {
    // Create tables using raw SQL to avoid schema conflicts
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "username" text NOT NULL UNIQUE,
        "password" text NOT NULL,
        "name" text NOT NULL,
        "email" text,
        "role" text DEFAULT 'member' NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "events" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "description" text,
        "date" text NOT NULL,
        "time" text NOT NULL,
        "location" text NOT NULL,
        "custom_location" text,
        "max_attendees" integer,
        "current_attendees" integer DEFAULT 0 NOT NULL,
        "created_by" text DEFAULT 'system' NOT NULL,
        "is_cancelled" boolean DEFAULT false NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "event_registrations" (
        "id" serial PRIMARY KEY NOT NULL,
        "event_id" integer NOT NULL,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "phone" text,
        "num_adults" integer DEFAULT 1 NOT NULL,
        "num_children" integer DEFAULT 0 NOT NULL,
        "dietary_restrictions" text,
        "comments" text,
        "registered_at" text DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "contact_messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "email" text NOT NULL,
        "phone" text,
        "subject" text NOT NULL,
        "message" text NOT NULL,
        "created_at" text DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "documents" (
        "id" serial PRIMARY KEY NOT NULL,
        "title" text NOT NULL,
        "filename" text NOT NULL,
        "category" text NOT NULL,
        "description" text,
        "uploaded_by" text NOT NULL,
        "uploaded_at" text DEFAULT now() NOT NULL,
        "file_size" integer,
        "mime_type" text,
        "cloudinary_url" text,
        "cloudinary_public_id" text
      );
    `);

    // Add foreign key constraint
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "event_registrations" 
        ADD CONSTRAINT "event_registrations_event_id_events_id_fk" 
        FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log('Database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}