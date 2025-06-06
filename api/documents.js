import { neon } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  try {
    // CORS headers for all requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Handle contact messages POST requests
    if (req.method === 'POST' && req.url.includes('contact')) {
      return handleContactMessage(req, res);
    }

    // Only allow GET requests for documents
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Check for database URL
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is missing');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    // Initialize database connection
    const sql = neon(process.env.DATABASE_URL);

    // Fetch documents from database
    const documents = await sql`
      SELECT 
        id, 
        title, 
        filename, 
        cloudinary_url as "fileUrl", 
        file_size as "fileSize", 
        mime_type as "mimeType",
        category, 
        description, 
        uploaded_at as "uploadedAt"
      FROM documents 
      ORDER BY uploaded_at DESC
    `;

    // Return documents
    return res.status(200).json(documents);

  } catch (error) {
    console.error('Documents API error:', error);
    console.error('Error details:', error.message);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

async function handleContactMessage(req, res) {
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

    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Create contact message in database
    const contactMessages = await sql`
      INSERT INTO contact_messages (name, email, phone, subject, message, created_at)
      VALUES (${isAnonymous ? '' : (name || '')}, ${isAnonymous ? '' : (email || '')}, ${phone || null}, ${subject}, ${message}, NOW())
      RETURNING *
    `;

    const contactMessage = contactMessages[0];

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

async function sendContactEmail(params) {
  const { name, email, phone, subject, message, isAnonymous } = params;
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  
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