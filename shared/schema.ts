import { pgTable, text, serial, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // "admin", "member", "staff"
  createdAt: text("created_at").notNull(),
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  customLocation: text("custom_location"), // For "Annet" locations
  maxAttendees: integer("max_attendees"),
  currentAttendees: integer("current_attendees").default(0),
  type: text("type").notNull(), // "meeting", "event", "dugnad", etc.
  status: text("status").default("active").notNull(), // "active", "cancelled"
  vigiloSignup: boolean("vigilo_signup").default(false), // true if signup is through Vigilo platform
  noSignup: boolean("no_signup").default(false), // true if event has no signup/registration
});

export const eventRegistrations = pgTable("event_registrations", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  attendeeCount: integer("attendee_count").default(1),
  comments: text("comments"),
  language: text("language").default("no"),
  childrenNames: text("children_names"), // JSON array of child names for "foto" events
  photoSlots: text("photo_slots"), // JSON array of assigned "HH:MM" slots for "foto" events
}, (table) => ({
  eventIdIdx: index("event_registrations_event_id_idx").on(table.eventId),
  emailIdx: index("event_registrations_email_idx").on(table.email),
}));

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  filename: text("filename").notNull(),
  category: text("category").notNull(), // "protocol", "regulations", "budget", "other"
  description: text("description"),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  cloudinaryUrl: text("cloudinary_url"),
  cloudinaryPublicId: text("cloudinary_public_id"),
}, (table) => ({
  categoryIdx: index("documents_category_idx").on(table.category),
}));

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., "contact_info", "about_text"
  value: text("value").notNull(), // JSON string
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Table exists in production DB for blocking spam registrations
export const emailDomainBlacklist = pgTable("email_domain_blacklist", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull().unique(),
  category: text("category").notNull(), // A=disposable, B=spam, C=fake, D=invalid, F=typo
  action: text("action").notNull(), // "block" or "suggest"
  suggestedFix: text("suggested_fix"), // Corrected domain for typos (category F)
  description: text("description"),
  createdAt: text("created_at").notNull(),
});

export const fauBoardMembers = pgTable("fau_board_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Leder", "Medlem", "Vara"
  sortOrder: integer("sort_order").default(0), // For custom ordering
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Yearly calendar (Årskalender) - one row per (year, month)
export const yearlyCalendarEntries = pgTable("yearly_calendar_entries", {
  id: serial("id").primaryKey(),
  // Kindergarten year start (e.g. 2026 means barnehageår 2026/2027)
  schoolYear: integer("school_year").notNull(),
  // Calendar year for this row (so August 2026 has year=2026, January 2027 has year=2027)
  year: integer("year").notNull(),
  month: integer("month").notNull(), // 1-12
  // Entry kind:
  //   "week_event" → spans whole week (uses weekNumber, optionally weekdayStart..weekdayEnd)
  //   "day_event"  → specific day (uses date)
  //   "food"       → ukens varmmat for a given week
  //   "note"       → freeform note attached to a week
  //   "closed"     → barnehagen er stengt (planleggingsdag, ferie osv.) — single day, uses date
  entryType: text("entry_type").notNull(),
  weekNumber: integer("week_number"), // ISO week number, used for week_event/food/note (start week if span)
  weekNumberEnd: integer("week_number_end"), // optional end week for multi-week week_event/note spans
  weekdayStart: integer("weekday_start"), // 1=Mon..5=Fri (week_event range start, optional)
  weekdayEnd: integer("weekday_end"), // 1=Mon..5=Fri (week_event range end, optional)
  date: text("date"), // ISO date "YYYY-MM-DD" used for day_event
  title: text("title").notNull(),
  description: text("description"),
  color: text("color"), // optional CSS color hint, e.g. "red", "yellow", "green"
  // When true (only meaningful for day_event entries), surface this entry in
  // the homepage "Kommende arrangementer" list with an "I barnehagen" badge.
  showOnHomepage: boolean("show_on_homepage").default(false),
  // When true (only meaningful for day_event entries), surface this entry in
  // the homepage "Kommende arrangementer" list with a "For foreldre" badge.
  showForParents: boolean("show_for_parents").default(false),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => ({
  schoolYearIdx: index("yearly_calendar_school_year_idx").on(table.schoolYear),
  yearMonthIdx: index("yearly_calendar_year_month_idx").on(table.year, table.month),
}));

export const insertEventSchema = createInsertSchema(events).omit({ id: true, currentAttendees: true });
export const insertEventRegistrationSchema = createInsertSchema(eventRegistrations).omit({ id: true });
export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({ id: true, updatedAt: true });
export const insertFauBoardMemberSchema = createInsertSchema(fauBoardMembers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailDomainBlacklistSchema = createInsertSchema(emailDomainBlacklist).omit({ id: true });
export const insertYearlyCalendarEntrySchema = createInsertSchema(yearlyCalendarEntries).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertEventRegistration = z.infer<typeof insertEventRegistrationSchema>;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type InsertFauBoardMember = z.infer<typeof insertFauBoardMemberSchema>;
export type InsertYearlyCalendarEntry = z.infer<typeof insertYearlyCalendarEntrySchema>;

export type Event = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type User = typeof users.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type FauBoardMember = typeof fauBoardMembers.$inferSelect;
export type EmailDomainBlacklist = typeof emailDomainBlacklist.$inferSelect;
export type YearlyCalendarEntry = typeof yearlyCalendarEntries.$inferSelect;
