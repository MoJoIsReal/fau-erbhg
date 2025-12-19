import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // "admin", "member"
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
  eventId: integer("event_id").notNull().references(() => events.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  attendeeCount: integer("attendee_count").default(1),
  comments: text("comments"),
  language: text("language").default("no"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
});

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
});

export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., "contact_info", "about_text"
  value: text("value").notNull(), // JSON string
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const fauBoardMembers = pgTable("fau_board_members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // "Leder", "Medlem", "Vara"
  sortOrder: integer("sort_order").default(0), // For custom ordering
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, currentAttendees: true });
export const insertEventRegistrationSchema = createInsertSchema(eventRegistrations).omit({ id: true, registeredAt: true });
export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({ id: true, updatedAt: true });
export const insertFauBoardMemberSchema = createInsertSchema(fauBoardMembers).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertEventRegistration = z.infer<typeof insertEventRegistrationSchema>;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type InsertFauBoardMember = z.infer<typeof insertFauBoardMemberSchema>;

export type Event = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type User = typeof users.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type FauBoardMember = typeof fauBoardMembers.$inferSelect;
