import { getDb } from './_shared/database.js';
import nodemailer from 'nodemailer';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
} from './_shared/middleware.js';
import Sentry from './_shared/sentry.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!subject || !message) {
      return res.status(400).json({
        error: 'Subject and message are required'
      });
    }

    // Validate subject is one of allowed values
    const allowedSubjects = ['anonymous', 'general', 'concern', 'feedback'];
    if (!allowedSubjects.includes(subject)) {
      return res.status(400).json({
        error: 'Invalid subject type'
      });
    }

    // For anonymous submissions, we don't require name/email
    const isAnonymous = subject === 'anonymous';

    // Sanitize inputs
    const sanitizedName = isAnonymous ? '' : sanitizeText(name, 100);
    const sanitizedEmail = isAnonymous ? '' : sanitizeEmail(email);
    const sanitizedPhone = sanitizePhone(phone);
    const sanitizedMessage = sanitizeText(message, 5000);

    if (!isAnonymous && (!sanitizedName || !sanitizedEmail)) {
      return res.status(400).json({
        error: 'Valid name and email are required for non-anonymous submissions'
      });
    }

    if (!sanitizedMessage) {
      return res.status(400).json({
        error: 'Valid message is required'
      });
    }

    const sql = getDb();

    // Create contact message in database
    const contactMessages = await sql`
      INSERT INTO contact_messages (name, email, phone, subject, message, created_at)
      VALUES (${sanitizedName}, ${sanitizedEmail}, ${sanitizedPhone}, ${subject}, ${sanitizedMessage}, NOW())
      RETURNING *
    `;

    const contactMessage = contactMessages[0];

    // Send email notification (if configured)
    try {
      await sendContactEmail({
        name: isAnonymous ? 'Anonym' : sanitizedName,
        email: isAnonymous ? 'noreply@example.com' : sanitizedEmail,
        phone: sanitizedPhone,
        subject,
        message: sanitizedMessage,
        isAnonymous
      });
      console.log('Contact email sent successfully');
    } catch (emailError) {
      console.error('Failed to send contact email:', emailError);
      // Don't fail the request if email fails, just log to Sentry
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(emailError);
      }
    }

    return res.status(201).json(contactMessage);
  } catch (error) {
    return handleError(res, error);
  }
}

async function sendContactEmail(params) {
  const { name, email, phone, subject, message, isAnonymous } = params;

  // Validate email configuration
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('Email configuration missing: GMAIL_USER and GMAIL_APP_PASSWORD must be set');
    throw new Error('Email configuration not available');
  }

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
