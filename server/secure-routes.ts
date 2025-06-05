import type { Express } from "express";
import { createServer, type Server } from "http";
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

// Secure database connection
function createDatabaseConnection() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return neon(connectionString);
}

// Configure multer for secure file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  }
});

export async function registerSecureRoutes(app: Express): Promise<Server> {
  
  // Secure status endpoint
  app.get('/api/secure-status', (req, res) => {
    const hasDatabase = !!process.env.DATABASE_URL;
    const hasSession = !!process.env.SESSION_SECRET;
    const hasEmail = !!process.env.GMAIL_APP_PASSWORD;
    const hasCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'FAU Erdal Barnehage API - Secure Version',
      version: '2.0.0',
      environment: {
        database_configured: hasDatabase,
        session_configured: hasSession,
        email_configured: hasEmail,
        cloudinary_configured: hasCloudinary,
        node_version: process.version
      }
    });
  });

  // Database initialization
  app.post('/api/init-secure-db', async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({ error: 'Database configuration missing' });
      }

      const sql = neon(process.env.DATABASE_URL);

      // Create all tables
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          role VARCHAR(50) DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          date DATE NOT NULL,
          time TIME NOT NULL,
          location VARCHAR(255),
          custom_location VARCHAR(255),
          max_attendees INTEGER,
          current_attendees INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS event_registrations (
          id SERIAL PRIMARY KEY,
          event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          language VARCHAR(10) DEFAULT 'no',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          category VARCHAR(100) NOT NULL,
          file_url TEXT NOT NULL,
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(50),
          subject VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_anonymous BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `;

      res.json({
        success: true,
        message: 'Database initialized successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Database initialization error:', error);
      res.status(500).json({
        error: 'Database initialization failed',
        details: error.message
      });
    }
  });

  // Secure authentication
  app.post('/api/secure-auth', async (req, res) => {
    try {
      if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
        return res.status(500).json({ error: 'Server configuration missing' });
      }

      const sql = neon(process.env.DATABASE_URL);
      const { username, password, action } = req.body;

      if (action === 'login') {
        if (!username || !password) {
          return res.status(400).json({ error: 'Username and password required' });
        }

        const users = await sql`
          SELECT id, username, password_hash, name, role 
          FROM users 
          WHERE username = ${username}
        `;

        if (users.length === 0) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = users[0];
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokenData = {
          userId: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          timestamp: Date.now(),
          expires: Date.now() + (24 * 60 * 60 * 1000)
        };

        const token = Buffer.from(JSON.stringify(tokenData)).toString('base64');

        res.json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role
          },
          token
        });
      } else if (action === 'register') {
        const { name, setupKey } = req.body;

        if (!username || !password || !name) {
          return res.status(400).json({ error: 'All fields required' });
        }

        if (setupKey === process.env.ADMIN_SETUP_KEY) {
          const existingAdmin = await sql`
            SELECT id FROM users WHERE role = 'admin'
          `;

          if (existingAdmin.length > 0) {
            return res.status(400).json({ error: 'Admin already exists' });
          }

          const hashedPassword = await bcrypt.hash(password, 12);

          const newAdmin = await sql`
            INSERT INTO users (username, password_hash, name, role)
            VALUES (${username}, ${hashedPassword}, ${name}, 'admin')
            RETURNING id, username, name, role
          `;

          res.status(201).json({
            success: true,
            message: 'Admin user created',
            user: newAdmin[0]
          });
        } else {
          res.status(403).json({ error: 'Registration not allowed' });
        }
      } else {
        res.status(400).json({ error: 'Invalid action' });
      }

    } catch (error) {
      console.error('Auth error:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // Secure events management
  app.get('/api/secure-events', async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({ error: 'Database configuration missing' });
      }

      const sql = neon(process.env.DATABASE_URL);
      
      const events = await sql`
        SELECT 
          id, title, description, date, time, location, custom_location,
          max_attendees, current_attendees, status, created_at
        FROM events 
        WHERE status = 'active'
        ORDER BY date ASC, time ASC
      `;

      res.json(events);

    } catch (error) {
      console.error('Events API error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/secure-events', async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({ error: 'Database configuration missing' });
      }

      const sql = neon(process.env.DATABASE_URL);
      const { title, description, date, time, location, custom_location, max_attendees } = req.body;

      if (!title || !date || !time) {
        return res.status(400).json({ error: 'Title, date, and time are required' });
      }

      const newEvent = await sql`
        INSERT INTO events (title, description, date, time, location, custom_location, max_attendees)
        VALUES (${title}, ${description}, ${date}, ${time}, ${location}, ${custom_location}, ${max_attendees})
        RETURNING *
      `;

      res.status(201).json(newEvent[0]);

    } catch (error) {
      console.error('Events API error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Gmail email service
  app.post('/api/email-gmail', async (req, res) => {
    try {
      if (!process.env.GMAIL_APP_PASSWORD) {
        return res.status(500).json({ 
          error: 'Gmail configuration missing',
          setup_instructions: 'Create Gmail app password in Google Account settings'
        });
      }

      const transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: 'fauerdalbarnehage@gmail.com',
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });

      const { type, data } = req.body;

      if (type === 'contact') {
        const { name, email, phone, subject, message, isAnonymous } = data;

        const mailOptions = {
          from: 'fauerdalbarnehage@gmail.com',
          to: 'fauerdalbarnehage@gmail.com',
          subject: `Contact Form: ${subject}`,
          html: `
            <h2>New Contact Message</h2>
            <p><strong>From:</strong> ${isAnonymous ? 'Anonymous' : `${name} (${email})`}</p>
            ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <hr>
            <p><em>Sent from FAU Erdal Barnehage website</em></p>
          `
        };

        await transporter.sendMail(mailOptions);

        res.json({
          success: true,
          message: 'Contact message sent successfully'
        });
      } else if (type === 'event_confirmation') {
        const { registration, event, language = 'no' } = data;

        const isNorwegian = language === 'no';
        const subject = isNorwegian 
          ? `Påmelding bekreftet: ${event.title}`
          : `Registration confirmed: ${event.title}`;

        const mailOptions = {
          from: 'fauerdalbarnehage@gmail.com',
          to: registration.email,
          subject,
          html: isNorwegian ? `
            <h2>Påmelding bekreftet!</h2>
            <p>Hei ${registration.name},</p>
            <p>Din påmelding til følgende arrangement er bekreftet:</p>
            
            <div style="background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px;">
              <h3>${event.title}</h3>
              <p><strong>Dato:</strong> ${event.date}</p>
              <p><strong>Tid:</strong> ${event.time}</p>
              <p><strong>Sted:</strong> ${event.location}${event.custom_location ? ` - ${event.custom_location}` : ''}</p>
              ${event.description ? `<p><strong>Beskrivelse:</strong> ${event.description}</p>` : ''}
            </div>
            
            <p>Vi gleder oss til å se deg!</p>
            <p>Hvis du har spørsmål, kan du kontakte oss på fauerdalbarnehage@gmail.com</p>
            
            <hr>
            <p><em>FAU Erdal Barnehage</em></p>
          ` : `
            <h2>Registration Confirmed!</h2>
            <p>Hello ${registration.name},</p>
            <p>Your registration for the following event has been confirmed:</p>
            
            <div style="background: #f5f5f5; padding: 15px; margin: 15px 0; border-radius: 5px;">
              <h3>${event.title}</h3>
              <p><strong>Date:</strong> ${event.date}</p>
              <p><strong>Time:</strong> ${event.time}</p>
              <p><strong>Location:</strong> ${event.location}${event.custom_location ? ` - ${event.custom_location}` : ''}</p>
              ${event.description ? `<p><strong>Description:</strong> ${event.description}</p>` : ''}
            </div>
            
            <p>We look forward to seeing you!</p>
            <p>If you have any questions, please contact us at fauerdalbarnehage@gmail.com</p>
            
            <hr>
            <p><em>FAU Erdal Barnehage</em></p>
          `
        };

        await transporter.sendMail(mailOptions);

        res.json({
          success: true,
          message: 'Confirmation email sent'
        });
      } else {
        res.status(400).json({ error: 'Invalid email type' });
      }

    } catch (error) {
      console.error('Gmail email error:', error);
      res.status(500).json({ 
        error: 'Email sending failed',
        details: error.message 
      });
    }
  });

  // Secure contact endpoint with email integration
  app.post('/api/secure-contact', async (req, res) => {
    try {
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({ error: 'Database configuration missing' });
      }

      const sql = neon(process.env.DATABASE_URL);
      const { name, email, phone, subject, message, isAnonymous = false } = req.body;

      if (!subject || !message) {
        return res.status(400).json({ error: 'Subject and message are required' });
      }

      if (!isAnonymous && (!name || !email)) {
        return res.status(400).json({ error: 'Name and email are required for non-anonymous messages' });
      }

      // Store in database
      await sql`
        INSERT INTO contact_messages (name, email, phone, subject, message, is_anonymous)
        VALUES (${name || 'Anonymous'}, ${email || ''}, ${phone || ''}, ${subject}, ${message}, ${isAnonymous})
      `;

      // Send email notification
      try {
        const emailResponse = await fetch(`http://localhost:5000/api/email-gmail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'contact',
            data: {
              name,
              email,
              phone,
              subject,
              message,
              isAnonymous
            }
          })
        });
        
        if (!emailResponse.ok) {
          console.warn('Failed to send notification email');
        }
      } catch (emailError) {
        console.warn('Email service unavailable:', emailError.message);
      }

      res.status(201).json({
        success: true,
        message: 'Message sent successfully'
      });

    } catch (error) {
      console.error('Contact API error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}