import { z } from "zod";

/**
 * The base zod schemas the public forms validate against: the fields of the
 * matching `insert*Schema` in `shared/schema.ts` that a form actually fills.
 *
 * Written out rather than imported because `createInsertSchema` needs the
 * Drizzle table objects at runtime, which put drizzle-orm's pg-core (about
 * 67 kB gzipped) into the signup and contact pages. Only types come from
 * schema.ts here. `tests/form-schemas.test.mjs` compares every field with the
 * generated insert schema, and fails if a required column is missing, so the
 * two cannot drift apart unnoticed.
 */

export const eventFormBaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.string(),
  time: z.string(),
  location: z.string(),
  customLocation: z.string().nullable().optional(),
  maxAttendees: z.number().int().nullable().optional(),
  registrationDeadline: z.string().nullable().optional(),
  type: z.string(),
  vigiloSignup: z.boolean().nullable().optional(),
  noSignup: z.boolean().nullable().optional(),
  notifyNewsletter: z.boolean().nullable().optional(),
  potluck: z.boolean().optional(),
});

// eventId is not a field: the modal adds it from the event being signed up for.
export const registrationFormBaseSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable().optional(),
  attendeeCount: z.number().int().nullable().optional(),
  comments: z.string().nullable().optional(),
  childrenNames: z.string().nullable().optional(),
  foodContribution: z.string().nullable().optional(),
});

export const contactFormBaseSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable().optional(),
  subject: z.string(),
  message: z.string(),
});
