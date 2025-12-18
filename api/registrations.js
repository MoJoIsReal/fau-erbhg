import { getDb } from './_shared/database.js';
import nodemailer from 'nodemailer';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNumber
} from './_shared/middleware.js';
import Sentry from './_shared/sentry.js';

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  try {
    const sql = getDb();

    if (req.method === 'GET') {
      const { eventId } = req.query;

      if (!eventId || isNaN(parseInt(eventId))) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      const eventIdNum = parseInt(eventId);

      // Check if authenticated (for admin view with full details)
      const user = parseAuthToken(req);

      if (user) {
        // Authenticated - return full registration details
        const registrations = await sql`
          SELECT id, event_id as "eventId", name, email, phone,
                 attendee_count as "attendeeCount", comments,
                 registered_at as "registeredAt"
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
          ORDER BY registered_at DESC
        `;
        return res.status(200).json(registrations);
      } else {
        // Public access - return basic count only
        const registrations = await sql`
          SELECT id, name, email, phone, attendee_count, comments, language
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
          ORDER BY id DESC
        `;
        return res.status(200).json(registrations);
      }
    }

    if (req.method === 'POST') {
      // Public access - Create new registration
      const { eventId, name, email, phone, attendeeCount, comments, language } = req.body;

      // Sanitize inputs
      const sanitizedName = sanitizeText(name, 100);
      const sanitizedEmail = sanitizeEmail(email);
      const sanitizedPhone = sanitizePhone(phone);
      const sanitizedComments = comments ? sanitizeText(comments, 1000) : null;
      const sanitizedAttendeeCount = sanitizeNumber(attendeeCount, 1, 100) || 1;
      const sanitizedLanguage = ['no', 'en'].includes(language) ? language : 'no';

      if (!eventId || !sanitizedName || !sanitizedEmail) {
        return res.status(400).json({ error: 'Event ID, valid name and email are required' });
      }

      // Check email domain against database blacklist
      const emailDomain = sanitizedEmail.split('@')[1]?.toLowerCase();

      if (emailDomain) {
        const blacklistedDomains = await sql`
          SELECT domain, category, action, suggested_fix, description
          FROM email_domain_blacklist
          WHERE domain = ${emailDomain}
        `;

        if (blacklistedDomains.length > 0) {
          const entry = blacklistedDomains[0];

          if (entry.action === 'block') {
            // Hard block for categories A, B, C, D
            const errorMessage = sanitizedLanguage === 'no'
              ? 'Ugyldig e-postadresse. Bruk en ekte e-post.'
              : 'Invalid email address. Please use a real email.';
            return res.status(400).json({
              error: errorMessage,
              category: entry.category
            });
          } else if (entry.action === 'suggest' && entry.suggested_fix) {
            // Suggest correction for category F (typos)
            const errorMessage = sanitizedLanguage === 'no'
              ? `Mente du "${sanitizedEmail.split('@')[0]}@${entry.suggested_fix}"?`
              : `Did you mean "${sanitizedEmail.split('@')[0]}@${entry.suggested_fix}"?`;
            return res.status(400).json({
              error: errorMessage,
              suggestion: `${sanitizedEmail.split('@')[0]}@${entry.suggested_fix}`,
              category: entry.category
            });
          }
        }
      }

      const eventIdNum = parseInt(eventId);

      if (isNaN(eventIdNum)) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      // Check if event exists and is active
      const events = await sql`
        SELECT id, title, date, time, location, custom_location, max_attendees, current_attendees
        FROM events
        WHERE id = ${eventIdNum} AND status = 'active'
      `;

      if (events.length === 0) {
        return res.status(404).json({ error: 'Event not found or not active' });
      }

      const event = events[0];
      const requestedAttendees = sanitizedAttendeeCount;

      // Check if email already registered for this event
      const existingRegistrations = await sql`
        SELECT id FROM event_registrations
        WHERE event_id = ${eventIdNum} AND email = ${sanitizedEmail}
      `;

      if (existingRegistrations.length > 0) {
        return res.status(400).json({
          error: 'This email is already registered for this event'
        });
      }

      // Check capacity
      if (event.max_attendees &&
          (event.current_attendees + requestedAttendees) > event.max_attendees) {
        return res.status(400).json({
          error: 'Event is at capacity',
          available: event.max_attendees - event.current_attendees
        });
      }

      // Create registration
      const newRegistration = await sql`
        INSERT INTO event_registrations (
          event_id, name, email, phone, attendee_count, comments, language
        ) VALUES (
          ${eventIdNum}, ${sanitizedName}, ${sanitizedEmail}, ${sanitizedPhone},
          ${requestedAttendees}, ${sanitizedComments}, ${sanitizedLanguage}
        )
        RETURNING *
      `;

      // Update event attendee count
      await sql`
        UPDATE events
        SET current_attendees = current_attendees + ${requestedAttendees}
        WHERE id = ${eventIdNum}
      `;

      // Send confirmation email (if configured)
      try {
        await sendEventConfirmationEmail({
          registration: newRegistration[0],
          event: event,
          language: sanitizedLanguage
        });
        console.log('Event confirmation email sent successfully');
      } catch (emailError) {
        console.error('Failed to send event confirmation email:', emailError);
        // Don't fail the request if email fails, just log to Sentry
        if (process.env.NODE_ENV === 'production') {
          Sentry.captureException(emailError);
        }
      }

      return res.status(201).json(newRegistration[0]);
    }

    if (req.method === 'DELETE') {
      // Authenticated access required for deletion
      const user = parseAuthToken(req);
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // CSRF protection for state-changing requests
      if (!requireCsrf(req, res)) return;

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

  } catch (error) {
    return handleError(res, error);
  }
}

async function sendEventConfirmationEmail(params) {
  const { registration, event, language } = params;

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

  const isNorwegian = language === 'no';

  const subject = isNorwegian
    ? `Påmelding bekreftet: ${event.title}`
    : `Registration confirmed: ${event.title}`;

  const emailContent = isNorwegian ? `
Hei ${registration.name},

Din påmelding til "${event.title}" er bekreftet!

Detaljer:
- Navn: ${registration.name}
- E-post: ${registration.email}
- Telefon: ${registration.phone || 'Ikke oppgitt'}
- Antall deltakere: ${registration.attendee_count || 1}
${registration.comments ? `- Kommentarer: ${registration.comments}` : ''}

Arrangementsinformasjon:
- Tittel: ${event.title}
- Dato: ${new Date(event.date).toLocaleDateString('no-NO')}
- Tid: ${event.time}
- Sted: ${event.location}${event.custom_location ? ` (${event.custom_location})` : ''}

Vi ser fram til å se deg!

Med vennlig hilsen,
FAU Erdal Barnehage
` : `
Hello ${registration.name},

Your registration for "${event.title}" has been confirmed!

Details:
- Name: ${registration.name}
- Email: ${registration.email}
- Phone: ${registration.phone || 'Not provided'}
- Number of attendees: ${registration.attendee_count || 1}
${registration.comments ? `- Comments: ${registration.comments}` : ''}

Event information:
- Title: ${event.title}
- Date: ${new Date(event.date).toLocaleDateString('en-US')}
- Time: ${event.time}
- Location: ${event.location}${event.custom_location ? ` (${event.custom_location})` : ''}

We look forward to seeing you!

Best regards,
FAU Erdal Barnehage
`;

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: registration.email,
    subject: subject,
    text: emailContent,
  };

  await transporter.sendMail(mailOptions);
}
