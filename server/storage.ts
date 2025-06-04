import { 
  users, events, eventRegistrations, contactMessages, documents,
  type User, type Event, type EventRegistration, type ContactMessage, type Document,
  type InsertUser, type InsertEvent, type InsertEventRegistration, 
  type InsertContactMessage, type InsertDocument
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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private events: Map<number, Event>;
  private eventRegistrations: Map<number, EventRegistration>;
  private contactMessages: Map<number, ContactMessage>;
  private documents: Map<number, Document>;
  private currentUserId: number;
  private currentEventId: number;
  private currentRegistrationId: number;
  private currentMessageId: number;
  private currentDocumentId: number;

  constructor() {
    this.users = new Map();
    this.events = new Map();
    this.eventRegistrations = new Map();
    this.contactMessages = new Map();
    this.documents = new Map();
    this.currentUserId = 1;
    this.currentEventId = 1;
    this.currentRegistrationId = 1;
    this.currentMessageId = 1;
    this.currentDocumentId = 1;

    // Initialize with some sample data
    this.initializeData();
    
    // Add past event for demonstration
    this.addPastEventSample();
  }

  private async addPastEventSample() {
    // No sample data for production deployment
  }

  private async initializeData() {
    // Create single council login
    const bcrypt = await import('bcryptjs');
    const councilUser = {
      username: "fauerdalbarnehage@gmail.com",
      password: await bcrypt.hash("TyWm2c8a3eMrr0*", 10),
      name: "FAU Erdal Barnehage",
      role: "admin",
      createdAt: new Date().toISOString()
    };

    const id = this.currentUserId++;
    this.users.set(id, { ...councilUser, id });

    // No sample data for production deployment

    // No sample documents for production deployment

    // No sample documents to initialize for production
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { 
      ...insertUser, 
      id,
      role: insertUser.role || "member",
      createdAt: insertUser.createdAt || new Date().toISOString()
    };
    this.users.set(id, user);
    return user;
  }

  // Event methods
  async getAllEvents(): Promise<Event[]> {
    return Array.from(this.events.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getEvent(id: number): Promise<Event | undefined> {
    return this.events.get(id);
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const id = this.currentEventId++;
    const newEvent: Event = { 
      ...event, 
      id, 
      currentAttendees: 0,
      maxAttendees: event.maxAttendees ?? null,
      customLocation: event.customLocation ?? null,
      status: "active"
    };
    this.events.set(id, newEvent);
    
    // Add sample past event on first creation for demonstration
    if (id === 3 && !this.events.has(999)) {
      this.addSamplePastEvent();
    }
    
    return newEvent;
  }

  private addSamplePastEvent() {
    const pastEvent: Event = {
      id: 999,
      title: "Juleavslutning 2024",
      description: "Tradisjonell juleavslutning med pepperkakebaking, julesanger og besøk av julenissen. Alle familier invitert til hyggestund.",
      date: "2024-12-15",
      time: "15:00",
      location: "Småbarnsfløyen",
      customLocation: null,
      maxAttendees: 25,
      currentAttendees: 18,
      type: "arrangement",
      status: "active"
    };
    this.events.set(999, pastEvent);

    // Add sample registrations
    const registrations = [
      { name: "Emma Hansen", email: "emma.hansen@example.com", phone: "+4792345678", attendeeCount: 3, comments: null },
      { name: "Lars Andersen", email: "lars.andersen@example.com", phone: "+4791234567", attendeeCount: 2, comments: null },
      { name: "Sofie Johansen", email: "sofie.johansen@example.com", phone: "+4793456789", attendeeCount: 4, comments: null },
      { name: "Martin Olsen", email: "martin.olsen@example.com", phone: "+4794567890", attendeeCount: 2, comments: null },
      { name: "Ingrid Nilsen", email: "ingrid.nilsen@example.com", phone: "+4795678901", attendeeCount: 3, comments: null },
      { name: "Thomas Berg", email: "thomas.berg@example.com", phone: "+4796789012", attendeeCount: 4, comments: null }
    ];

    registrations.forEach((reg, index) => {
      const regId = 500 + index;
      this.eventRegistrations.set(regId, {
        ...reg,
        id: regId,
        eventId: 999,
        language: 'no'
      });
    });
  }

  async updateEvent(id: number, event: Partial<InsertEvent>): Promise<Event | undefined> {
    const existing = this.events.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...event };
    this.events.set(id, updated);
    return updated;
  }

  async deleteEvent(id: number): Promise<boolean> {
    return this.events.delete(id);
  }

  async cancelEvent(id: number): Promise<Event | undefined> {
    const existing = this.events.get(id);
    if (!existing) return undefined;
    
    const cancelled = { ...existing, status: "cancelled" };
    this.events.set(id, cancelled);
    return cancelled;
  }

  // Event registration methods
  async getEventRegistrations(eventId: number): Promise<EventRegistration[]> {
    return Array.from(this.eventRegistrations.values()).filter(reg => reg.eventId === eventId);
  }

  async createEventRegistration(registration: InsertEventRegistration): Promise<EventRegistration> {
    const id = this.currentRegistrationId++;
    const newRegistration: EventRegistration = { 
      id,
      eventId: registration.eventId,
      name: registration.name,
      email: registration.email,
      phone: registration.phone ?? null,
      attendeeCount: registration.attendeeCount ?? null,
      comments: registration.comments ?? null,
      language: registration.language ?? 'no'
    };
    this.eventRegistrations.set(id, newRegistration);

    // Update event attendee count
    const event = this.events.get(registration.eventId);
    if (event) {
      event.currentAttendees = (event.currentAttendees || 0) + (registration.attendeeCount || 1);
      this.events.set(registration.eventId, event);
    }

    return newRegistration;
  }

  async deleteEventRegistration(id: number): Promise<boolean> {
    const registration = this.eventRegistrations.get(id);
    if (!registration) return false;

    // Update event attendee count
    const event = this.events.get(registration.eventId);
    if (event) {
      event.currentAttendees = Math.max(0, (event.currentAttendees || 0) - (registration.attendeeCount || 1));
      this.events.set(registration.eventId, event);
    }

    return this.eventRegistrations.delete(id);
  }

  // Contact message methods
  async getAllContactMessages(): Promise<ContactMessage[]> {
    return Array.from(this.contactMessages.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createContactMessage(message: InsertContactMessage): Promise<ContactMessage> {
    const id = this.currentMessageId++;
    const newMessage: ContactMessage = { 
      ...message, 
      id,
      phone: message.phone ?? null,
      createdAt: new Date().toISOString() 
    };
    this.contactMessages.set(id, newMessage);
    return newMessage;
  }

  // Document methods
  async getAllDocuments(): Promise<Document[]> {
    return Array.from(this.documents.values()).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async getDocument(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }

  async getDocumentsByCategory(category: string): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(doc => doc.category === category)
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const id = this.currentDocumentId++;
    const newDocument: Document = { 
      ...document, 
      id,
      description: document.description ?? null,
      fileSize: document.fileSize ?? null,
      mimeType: document.mimeType ?? null,
      cloudinaryUrl: document.cloudinaryUrl ?? null,
      cloudinaryPublicId: document.cloudinaryPublicId ?? null,
      uploadedAt: new Date().toISOString() 
    };
    this.documents.set(id, newDocument);
    return newDocument;
  }

  async deleteDocument(id: number): Promise<boolean> {
    return this.documents.delete(id);
  }
}

import { DatabaseStorage } from "./database-storage";

export const storage = new DatabaseStorage();
