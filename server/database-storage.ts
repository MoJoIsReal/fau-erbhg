import { db } from "./db";
import { 
  users, 
  events, 
  eventRegistrations, 
  contactMessages, 
  documents,
  type User,
  type Event,
  type EventRegistration,
  type ContactMessage,
  type Document,
  type InsertUser,
  type InsertEvent,
  type InsertEventRegistration,
  type InsertContactMessage,
  type InsertDocument
} from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { IStorage } from "./storage";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Event methods
  async getAllEvents(): Promise<Event[]> {
    return await db.select().from(events);
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values({
      ...event,
      currentAttendees: 0
    }).returning();
    return newEvent;
  }

  async updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(events)
      .set(event)
      .where(eq(events.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteEvent(id: number): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async cancelEvent(id: number): Promise<Event | undefined> {
    const [updatedEvent] = await db
      .update(events)
      .set({ status: "cancelled" })
      .where(eq(events.id, id))
      .returning();
    return updatedEvent;
  }

  // Event registration methods
  async getEventRegistrations(eventId: number): Promise<EventRegistration[]> {
    return await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, eventId));
  }

  async createEventRegistration(registration: InsertEventRegistration): Promise<EventRegistration> {
    const [newRegistration] = await db.insert(eventRegistrations).values(registration).returning();
    
    // Update event attendee count
    await db.update(events)
      .set({
        currentAttendees: sql`${events.currentAttendees} + ${registration.attendeeCount || 1}`
      })
      .where(eq(events.id, registration.eventId));

    return newRegistration;
  }

  async deleteEventRegistration(id: number): Promise<boolean> {
    const [registration] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, id));
    if (!registration) return false;

    const result = await db.delete(eventRegistrations).where(eq(eventRegistrations.id, id));
    
    if ((result.rowCount ?? 0) > 0) {
      // Update event attendee count
      await db.update(events)
        .set({
          currentAttendees: sql`${events.currentAttendees} - ${registration.attendeeCount || 1}`
        })
        .where(eq(events.id, registration.eventId));
      return true;
    }
    
    return false;
  }

  // Contact message methods
  async getAllContactMessages(): Promise<ContactMessage[]> {
    return await db.select().from(contactMessages);
  }

  async createContactMessage(message: InsertContactMessage): Promise<ContactMessage> {
    const [newMessage] = await db.insert(contactMessages).values({
      ...message,
      createdAt: new Date().toISOString()
    }).returning();
    return newMessage;
  }

  // Document methods
  async getAllDocuments(): Promise<Document[]> {
    return await db.select().from(documents);
  }

  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document || undefined;
  }

  async getDocumentsByCategory(category: string): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.category, category));
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db.insert(documents).values({
      ...document,
      uploadedAt: new Date().toISOString()
    }).returning();
    return newDocument;
  }

  async deleteDocument(id: number): Promise<boolean> {
    const result = await db.delete(documents).where(eq(documents.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}