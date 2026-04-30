import {
  type User, type Event, type EventRegistration, type ContactMessage, type Document,
  type YearlyCalendarEntry,
  type InsertUser, type InsertEvent, type InsertEventRegistration,
  type InsertContactMessage, type InsertDocument,
  type InsertYearlyCalendarEntry
} from "@shared/schema";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Event methods
  getAllEvents(): Promise<Event[]>;
  getEvent(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: number): Promise<boolean>;
  cancelEvent(id: number): Promise<Event | undefined>;

  // Event registration methods
  getEventRegistrations(eventId: number): Promise<EventRegistration[]>;
  createEventRegistration(registration: InsertEventRegistration): Promise<EventRegistration>;
  deleteEventRegistration(id: number): Promise<boolean>;

  // Contact message methods
  getAllContactMessages(): Promise<ContactMessage[]>;
  createContactMessage(message: InsertContactMessage): Promise<ContactMessage>;

  // Document methods
  getAllDocuments(): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsByCategory(category: string): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  deleteDocument(id: number): Promise<boolean>;

  // Yearly calendar methods
  getYearlyCalendarEntries(schoolYear: number): Promise<YearlyCalendarEntry[]>;
  getYearlyCalendarEntry(id: number): Promise<YearlyCalendarEntry | undefined>;
  createYearlyCalendarEntry(entry: InsertYearlyCalendarEntry): Promise<YearlyCalendarEntry>;
  updateYearlyCalendarEntry(id: number, entry: Partial<InsertYearlyCalendarEntry>): Promise<YearlyCalendarEntry | undefined>;
  deleteYearlyCalendarEntry(id: number): Promise<boolean>;
}

import { DatabaseStorage } from "./database-storage";

export const storage = new DatabaseStorage();