import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertEventRegistrationSchema, insertContactMessageSchema, insertDocumentSchema } from "@shared/schema";
import { uploadFile, deleteFile } from "./cloudinary";
import { authenticateUser, requireCouncilMember } from "./auth";
import { sendContactEmail, sendEventConfirmationEmail, sendEventCancellationEmail } from "./email";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";

// Configure multer for file uploads with enhanced security
const upload = multer({
  storage: multer.memoryStorage(), // Use memory storage for serverless
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for better performance
    files: 1 // Only allow one file at a time
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    // Enhanced security checks
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only PDF, Word, and Excel files are allowed.'));
    }
    
    // Check file extension matches MIME type
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      return cb(new Error('Invalid file extension.'));
    }
    
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // SEO Routes MUST come first before other routes
  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://fau-erdal-barnehage.vercel.app';
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/events</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>${baseUrl}/files</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>
</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(sitemap);
  });

  app.get('/robots.txt', (req, res) => {
    const robots = `User-agent: *
Allow: /

Sitemap: https://fau-erdal-barnehage.vercel.app/sitemap.xml

# Specific rules for FAU Erdal Barnehage
User-agent: Googlebot
Allow: /
Crawl-delay: 1

User-agent: Bingbot
Allow: /
Crawl-delay: 1`;
    
    res.set('Content-Type', 'text/plain');
    res.send(robots);
  });

  // Google Search Console verification file
  app.get('/google9ba7dafbc787aa0b.html', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send('google-site-verification: google9ba7dafbc787aa0b.html');
  });

  // JWT-based authentication for serverless deployment
  const isProduction = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-production';
  
  if (isProduction && jwtSecret === 'fallback-dev-secret-change-in-production') {
    throw new Error('SESSION_SECRET environment variable must be set in production');
  }

  // Authentication routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Brukernavn og passord er påkrevd' });
      }

      const user = await authenticateUser(username, password);
      if (!user) {
        return res.status(401).json({ message: 'Ugyldig brukernavn eller passord' });
      }

      // Create JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          name: user.name,
          role: user.role
        },
        jwtSecret,
        { expiresIn: '24h' }
      );

      res.json({ 
        message: 'Innlogging vellykket',
        token,
        user: { id: user.id, username: user.username, name: user.name, role: user.role }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Serverfeil ved innlogging' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.json({ message: 'Utlogging vellykket' });
  });

  app.get('/api/auth/user', (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Ikke innlogget' });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      res.json({
        userId: decoded.userId,
        username: decoded.username,
        name: decoded.name,
        role: decoded.role
      });
    } catch (error) {
      res.status(401).json({ message: 'Ikke innlogget' });
    }
  });
  // Events routes
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getAllEvents();
      res.json(events);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch events" });
    }
  });

  // Temporary route to add past event sample
  app.post("/api/add-sample-past-event", async (req, res) => {
    try {
      const pastEvent = await storage.createEvent({
        title: "Juleavslutning 2024",
        description: "Tradisjonell juleavslutning med pepperkakebaking, julesanger og besøk av julenissen. Alle familier invitert til hyggestund.",
        date: "2024-12-15",
        time: "15:00",
        location: "Småbarnsfløyen",
        customLocation: null,
        maxAttendees: 25,
        type: "arrangement",
        status: "active"
      });

      // Add sample registrations
      const registrations = [
        { name: "Emma Hansen", email: "emma.hansen@example.com", phone: "+4792345678", attendeeCount: 3, comments: null },
        { name: "Lars Andersen", email: "lars.andersen@example.com", phone: "+4791234567", attendeeCount: 2, comments: null },
        { name: "Sofie Johansen", email: "sofie.johansen@example.com", phone: "+4793456789", attendeeCount: 4, comments: null },
        { name: "Martin Olsen", email: "martin.olsen@example.com", phone: "+4794567890", attendeeCount: 2, comments: null },
        { name: "Ingrid Nilsen", email: "ingrid.nilsen@example.com", phone: "+4795678901", attendeeCount: 3, comments: null },
        { name: "Thomas Berg", email: "thomas.berg@example.com", phone: "+4796789012", attendeeCount: 4, comments: null }
      ];

      for (const reg of registrations) {
        await storage.createEventRegistration({
          ...reg,
          eventId: pastEvent.id
        });
      }

      res.json({ message: "Past event sample created", event: pastEvent });
    } catch (error) {
      res.status(500).json({ message: "Failed to create sample", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getEvent(id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch event" });
    }
  });

  app.post("/api/events", requireCouncilMember, async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      const event = await storage.createEvent(validatedData);
      res.status(201).json(event);
    } catch (error) {
      res.status(400).json({ message: "Invalid event data", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/events/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertEventSchema.partial().parse(req.body);
      const event = await storage.updateEvent(id, validatedData);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      res.status(400).json({ message: "Invalid event data", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.delete("/api/events/:id", requireCouncilMember, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Check if event has registrations
      const registrations = await storage.getEventRegistrations(id);
      if (registrations.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete event with registered attendees. Cancel the event instead.",
          hasAttendees: true
        });
      }
      
      const deleted = await storage.deleteEvent(id);
      if (!deleted) {
        return res.status(404).json({ message: "Event not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete event" });
    }
  });

  app.patch("/api/events/:id/cancel", requireCouncilMember, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getEvent(id);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      // Get all registrations for this event
      const registrations = await storage.getEventRegistrations(id);
      
      // Cancel the event
      const cancelledEvent = await storage.cancelEvent(id);
      if (!cancelledEvent) {
        return res.status(500).json({ message: "Failed to cancel event" });
      }

      // Send cancellation emails to all registered attendees
      const emailPromises = registrations.map(registration => 
        sendEventCancellationEmail({ 
          registration, 
          event: cancelledEvent,
          language: 'no' // Default to Norwegian, could be enhanced to detect user language
        })
      );

      try {
        await Promise.all(emailPromises);
        console.log(`Sent cancellation emails to ${registrations.length} attendees`);
      } catch (emailError) {
        console.error('Some cancellation emails failed to send:', emailError);
      }

      res.json(cancelledEvent);
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel event" });
    }
  });

  // Event registrations routes
  app.get("/api/events/:eventId/registrations", async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      const registrations = await storage.getEventRegistrations(eventId);
      res.json(registrations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch registrations" });
    }
  });

  app.post("/api/events/:eventId/registrations", async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      const validatedData = insertEventRegistrationSchema.parse({
        ...req.body,
        eventId
      });
      
      // Check if event exists and has space
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Check if event is cancelled
      if (event.status === "cancelled") {
        return res.status(400).json({ message: "Cannot register for cancelled event" });
      }
      
      // Check for duplicate email registration
      const existingRegistrations = await storage.getEventRegistrations(eventId);
      const emailExists = existingRegistrations.some(reg => 
        reg.email.toLowerCase() === validatedData.email.toLowerCase()
      );
      
      if (emailExists) {
        return res.status(400).json({ 
          message: "This email is already registered for this event" 
        });
      }
      
      if (event.maxAttendees && event.currentAttendees && 
          (event.currentAttendees + (validatedData.attendeeCount || 1)) > event.maxAttendees) {
        return res.status(400).json({ message: "Event is full" });
      }

      const registration = await storage.createEventRegistration(validatedData);
      
      // Send confirmation email
      try {
        const language = (req.body.language as 'no' | 'en') || 'no';
        await sendEventConfirmationEmail({ registration, event, language });
        console.log('Event confirmation email sent successfully');
      } catch (error) {
        console.error('Failed to send confirmation email:', error);
        // Continue with registration even if email fails
      }
      
      res.status(201).json(registration);
    } catch (error) {
      res.status(400).json({ message: "Invalid registration data", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Registrations API route (to match production Vercel function)
  app.get("/api/registrations", async (req, res) => {
    try {
      const { eventId } = req.query;
      
      if (!eventId || isNaN(parseInt(eventId as string))) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      const eventIdNum = parseInt(eventId as string);
      const registrations = await storage.getEventRegistrations(eventIdNum);
      res.json(registrations);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/registrations", async (req, res) => {
    try {
      const { eventId, name, email, phone, attendeeCount, comments, language } = req.body;

      if (!eventId || !name || !email) {
        return res.status(400).json({ error: 'Event ID, name and email are required' });
      }

      const eventIdNum = parseInt(eventId);
      
      if (isNaN(eventIdNum)) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      const validatedData = insertEventRegistrationSchema.parse({
        eventId: eventIdNum,
        name,
        email,
        phone: phone || null,
        attendeeCount: attendeeCount || 1,
        comments: comments || null,
        language: language || 'no'
      });
      
      // Check if event exists and has space
      const event = await storage.getEvent(eventIdNum);
      if (!event) {
        return res.status(404).json({ error: "Event not found or not active" });
      }
      
      // Check if event is cancelled
      if (event.status === "cancelled") {
        return res.status(400).json({ error: "Cannot register for cancelled event" });
      }
      
      // Check for duplicate email registration
      const existingRegistrations = await storage.getEventRegistrations(eventIdNum);
      const emailExists = existingRegistrations.some(reg => 
        reg.email.toLowerCase() === validatedData.email.toLowerCase()
      );
      
      if (emailExists) {
        return res.status(400).json({ 
          error: "This email is already registered for this event" 
        });
      }
      
      const requestedAttendees = validatedData.attendeeCount || 1;
      
      // Check capacity
      if (event.maxAttendees && 
          (event.currentAttendees + requestedAttendees) > event.maxAttendees) {
        return res.status(400).json({ 
          error: 'Event is at capacity',
          available: event.maxAttendees - event.currentAttendees
        });
      }

      const registration = await storage.createEventRegistration(validatedData);
      
      // Send confirmation email
      try {
        await sendEventConfirmationEmail({ 
          registration, 
          event,
          language: validatedData.language as 'no' | 'en'
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
      
      res.status(201).json(registration);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/registrations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteEventRegistration(id);
      if (!deleted) {
        return res.status(404).json({ message: "Registration not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete registration" });
    }
  });

  // Contact messages routes
  app.get("/api/contact-messages", async (req, res) => {
    try {
      const messages = await storage.getAllContactMessages();
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contact messages" });
    }
  });

  app.post("/api/contact-messages", async (req, res) => {
    try {
      const validatedData = insertContactMessageSchema.parse(req.body);
      
      // Send email notification
      const isAnonymous = validatedData.subject === 'anonymous';
      await sendContactEmail({
        name: isAnonymous ? '' : validatedData.name,
        email: isAnonymous ? '' : validatedData.email,
        phone: isAnonymous ? '' : (validatedData.phone || ''),
        subject: validatedData.subject,
        message: validatedData.message,
        isAnonymous
      });
      
      const message = await storage.createContactMessage(validatedData);
      res.status(201).json(message);
    } catch (error) {
      res.status(400).json({ message: "Invalid message data", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Documents routes
  app.get("/api/documents", async (req, res) => {
    try {
      const category = req.query.category as string;
      const documents = category 
        ? await storage.getDocumentsByCategory(category)
        : await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents", requireCouncilMember, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Upload file to Cloudinary using buffer (serverless compatible)
      const cloudinaryResult = await uploadFile(req.file.buffer, req.file.originalname);

      const validatedData = insertDocumentSchema.parse({
        title: req.body.title,
        filename: req.file.originalname,
        category: req.body.category,
        description: req.body.description,
        uploadedBy: req.body.uploadedBy || "Unknown",
        fileSize: cloudinaryResult.bytes,
        mimeType: req.file.mimetype,
        cloudinaryUrl: cloudinaryResult.url,
        cloudinaryPublicId: cloudinaryResult.publicId
      });

      const document = await storage.createDocument(validatedData);
      res.status(201).json(document);
    } catch (error) {
      res.status(400).json({ message: "Invalid document data", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Download document route
  app.get("/api/documents/:id/download", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const document = await storage.getDocument(id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (document.cloudinaryUrl) {
        // Convert to download URL with attachment flag for PDFs
        const downloadUrl = document.cloudinaryUrl.replace('/upload/', '/upload/fl_attachment/');
        console.log('Redirecting to download URL:', downloadUrl);
        return res.redirect(downloadUrl);
      } else {
        return res.status(404).json({ message: "File not available" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get document to find Cloudinary public ID
      const document = await storage.getDocument(id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Delete from Cloudinary if it has a public ID
      if (document.cloudinaryPublicId) {
        await deleteFile(document.cloudinaryPublicId);
      }

      const deleted = await storage.deleteDocument(id);
      if (!deleted) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
