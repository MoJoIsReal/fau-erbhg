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

export const insertEventSchema = createInsertSchema(events).omit({ id: true, currentAttendees: true });
export const insertEventRegistrationSchema = createInsertSchema(eventRegistrations).omit({ id: true });
export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploadedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true });

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertEventRegistration = z.infer<typeof insertEventRegistrationSchema>;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Event = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type User = typeof users.$inferSelect;
