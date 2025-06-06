import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import nodemailer from 'nodemailer';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

// Database schema
const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Database connection
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema: { contactMessages } });

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendContactEmail(params) {
  const { name, email, phone, subject, message, isAnonymous } = params;
  
  const emailContent = `
Ny henvendelse mottatt:

Navn: ${isAnonymous ? 'Anonym' : name}
E-post: ${isAnonymous ? 'Ikke oppgitt' : email}
Telefon: ${phone || 'Ikke oppgitt'}
Emne: ${subject}

Melding:
${message}

${isAnonymous ? 'Dette er en anonym henvendelse.' : ''}
`;

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    subject: `Ny henvendelse: ${subject}`,
    text: emailContent,
  };

  await transporter.sendMail(mailOptions);
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { name, email, phone, subject, message } = req.body;

      // Validate required fields
      if (!subject || !message) {
        return res.status(400).json({ 
          message: 'Subject and message are required' 
        });
      }

      // For anonymous submissions, we don't require name/email
      const isAnonymous = subject === 'anonymous';
      if (!isAnonymous && (!name || !email)) {
        return res.status(400).json({ 
          message: 'Name and email are required for non-anonymous submissions' 
        });
      }

      // Create contact message in database
      const [contactMessage] = await db
        .insert(contactMessages)
        .values({
          name: isAnonymous ? '' : (name || ''),
          email: isAnonymous ? '' : (email || ''),
          phone: phone || null,
          subject,
          message,
          createdAt: new Date()
        })
        .returning();

      // Send email notification
      try {
        await sendContactEmail({
          name: isAnonymous ? 'Anonym' : (name || ''),
          email: isAnonymous ? 'noreply@example.com' : (email || ''),
          phone: phone || '',
          subject,
          message,
          isAnonymous
        });
        console.log('Contact email sent successfully');
      } catch (emailError) {
        console.error('Failed to send contact email:', emailError);
        // Don't fail the request if email fails, just log it
      }

      return res.status(201).json(contactMessage);
    } catch (error) {
      console.error('Error creating contact message:', error);
      return res.status(500).json({ 
        message: 'Internal server error' 
      });
    }
  }

  if (req.method === 'GET') {
    try {
      const messages = await db
        .select()
        .from(contactMessages)
        .orderBy(contactMessages.createdAt);

      return res.status(200).json(messages);
    } catch (error) {
      console.error('Error fetching contact messages:', error);
      return res.status(500).json({ 
        message: 'Internal server error' 
      });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}