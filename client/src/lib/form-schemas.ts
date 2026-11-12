import { z } from "zod";
import { MAX_ATTENDEES_PER_REGISTRATION } from "@shared/constants";

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
  endTime: z.string().nullable().optional(),
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
  attendeeCount: z.number().int().optional(),
  comments: z.string().nullable().optional(),
  childrenNames: z.string().nullable().optional(),
  foodContribution: z.string().nullable().optional(),
});

// The address rule the API applies (sanitizeEmail in api/_shared/middleware.js),
// to the trimmed, lower-cased value, so the form refuses what the server would.
export const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
export function isValidEmail(value: string | null | undefined): boolean {
  return EMAIL_PATTERN.test(String(value ?? "").trim().toLowerCase());
}

export const contactFormBaseSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable().optional(),
  subject: z.string(),
  message: z.string(),
});

// The rules the public forms apply on top of the base schemas, built per
// language so the messages are in the one the form is shown in. Here rather
// than in the components so they are tested (tests/form-schemas.test.mjs):
// an empty form used to reach the server (UX-004).
export function createSignupFormSchema(messages: { min: string; max: string; required: string; email: string }) {
  return registrationFormBaseSchema.extend({
    name: z.string().trim().min(1, messages.required),
    email: z.string().trim().min(1, messages.required).refine(isValidEmail, messages.email),
    attendeeCount: z.number().min(1, messages.min).max(MAX_ATTENDEES_PER_REGISTRATION, messages.max),
    childrenNames: z.string().optional().nullable(),
    foodContribution: z.string().max(200).optional().nullable(),
  });
}

// An anonymous message needs neither name nor address; any other needs both.
export function createContactFormSchema(messages: { subject: string; required: string; email: string }) {
  return contactFormBaseSchema.extend({
    subject: z.string().min(1, messages.subject),
    message: z.string().trim().min(1, messages.required),
    website: z.string().optional(),
  }).superRefine((data, ctx) => {
    if (data.subject === "anonymous") return;
    if (!data.name.trim()) ctx.addIssue({ code: "custom", path: ["name"], message: messages.required });
    if (!data.email.trim()) ctx.addIssue({ code: "custom", path: ["email"], message: messages.required });
    else if (!isValidEmail(data.email)) ctx.addIssue({ code: "custom", path: ["email"], message: messages.email });
  });
}

