import { neon } from '@neondatabase/serverless';
import jwt from 'jsonwebtoken';
import { MailService } from '@sendgrid/mail';
import { v2 as cloudinary } from 'cloudinary';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract route from URL path
  const urlPath = req.url.split('?')[0];
  const route = urlPath.replace('/api/secure', '');

  // JWT authentication check for most routes
  if (!route.includes('/status')) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No valid authorization token provided' });
    }

    try {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'fallback-secret');
      if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } catch (jwtError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Route to appropriate handler
    if (route === '/status') {
      return res.status(200).json({ 
        status: 'authenticated',
        timestamp: new Date().toISOString()
      });
    }

    if (route === '/auth') {
      return handleAuth(req, res, sql);
    }

    if (route === '/contact') {
      return handleContact(req, res, sql);
    }

    if (route === '/documents') {
      return handleDocuments(req, res, sql);
    }

    if (route === '/email') {
      return handleEmail(req, res);
    }

    if (route === '/events') {
      return handleEvents(req, res, sql);
    }

    if (route === '/registrations') {
      return handleRegistrations(req, res, sql);
    }

    if (route === '/upload') {
      return handleUpload(req, res);
    }

    return res.status(404).json({ error: 'Route not found' });

  } catch (error) {
    console.error('Secure API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Auth handler
async function handleAuth(req, res, sql) {
  if (req.method === 'POST') {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const users = await sql`
      SELECT id, username, name, password_hash, role 
      FROM users 
      WHERE username = ${username}
    `;

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        name: user.name, 
        role: user.role 
      },
      process.env.SESSION_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      },
      token
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Contact handler
async function handleContact(req, res, sql) {
  if (req.method === 'GET') {
    const messages = await sql`
      SELECT id, name, email, phone, subject, message, is_anonymous as "isAnonymous", 
             created_at as "createdAt"
      FROM contact_messages 
      ORDER BY created_at DESC
    `;
    return res.status(200).json(messages);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Documents handler
async function handleDocuments(req, res, sql) {
  if (req.method === 'GET') {
    const documents = await sql`
      SELECT id, title, filename, file_url as "fileUrl", 
             file_size as "fileSize", mime_type as "mimeType",
             category, description, uploaded_at as "uploadedAt"
      FROM documents 
      ORDER BY uploaded_at DESC
    `;
    return res.status(200).json(documents);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const deletedDoc = await sql`
      DELETE FROM documents WHERE id = ${id} RETURNING file_url
    `;
    
    if (deletedDoc.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Email handler
async function handleEmail(req, res) {
  if (req.method === 'POST') {
    const { to, subject, text, html } = req.body;

    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    const mailService = new MailService();
    mailService.setApiKey(process.env.SENDGRID_API_KEY);

    try {
      await mailService.send({
        to,
        from: 'fauerdalbarnehage@gmail.com',
        subject,
        text,
        html
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Email error:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Events handler
async function handleEvents(req, res, sql) {
  if (req.method === 'GET') {
    const events = await sql`
      SELECT id, title, description, date, time, location, custom_location,
             max_attendees, current_attendees, type, status
      FROM events 
      WHERE status IN ('active', 'cancelled')
      ORDER BY date ASC, time ASC
    `;
    return res.status(200).json(events);
  }

  if (req.method === 'POST') {
    const { title, description, date, time, location, custom_location, max_attendees } = req.body;

    if (!title || !date || !time) {
      return res.status(400).json({ error: 'Title, date, and time are required' });
    }

    const newEvent = await sql`
      INSERT INTO events (title, description, date, time, location, custom_location, max_attendees)
      VALUES (${title}, ${description}, ${date}, ${time}, ${location}, ${custom_location}, ${max_attendees})
      RETURNING *
    `;

    return res.status(201).json(newEvent[0]);
  }

  if (req.method === 'PATCH') {
    const { id, action } = req.query;

    if (action === 'cancel') {
      const cancelledEvent = await sql`
        UPDATE events 
        SET status = 'cancelled'
        WHERE id = ${id}
        RETURNING *
      `;

      if (cancelledEvent.length === 0) {
        return res.status(404).json({ error: 'Event not found' });
      }

      return res.status(200).json(cancelledEvent[0]);
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const deletedEvent = await sql`
      DELETE FROM events WHERE id = ${id} RETURNING id
    `;

    if (deletedEvent.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    return res.status(200).json({ success: true, message: 'Event deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Registrations handler
async function handleRegistrations(req, res, sql) {
  const { eventId } = req.query;

  if (req.method === 'GET' && eventId) {
    const registrations = await sql`
      SELECT id, event_id as "eventId", name, email, phone, 
             attendee_count as "attendeeCount", comments, 
             registered_at as "registeredAt"
      FROM event_registrations 
      WHERE event_id = ${eventId}
      ORDER BY registered_at DESC
    `;
    return res.status(200).json(registrations);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const deletedReg = await sql`
      DELETE FROM event_registrations WHERE id = ${id} RETURNING event_id, attendee_count
    `;

    if (deletedReg.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    // Update event attendee count
    const { event_id, attendee_count } = deletedReg[0];
    await sql`
      UPDATE events 
      SET current_attendees = GREATEST(0, current_attendees - ${attendee_count || 1})
      WHERE id = ${event_id}
    `;

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Upload handler
async function handleUpload(req, res) {
  if (req.method === 'POST') {
    // Configure Cloudinary
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    try {
      const { fileData, filename, title, category, description } = req.body;
      
      // Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(fileData, {
        resource_type: 'auto',
        public_id: `fau-documents/${Date.now()}-${filename}`,
        use_filename: true
      });

      return res.status(200).json({
        success: true,
        fileUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id
      });
    } catch (error) {
      console.error('Upload error:', error);
      return res.status(500).json({ error: 'Upload failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}