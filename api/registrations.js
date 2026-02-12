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
                 registered_at as "registeredAt",
                 children_names as "childrenNames"
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
          ORDER BY registered_at DESC
        `;
        return res.status(200).json(registrations);
      } else {
        // Public access - return basic count only
        const registrations = await sql`
          SELECT id, name, email, phone, attendee_count, comments, language, children_names
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
          ORDER BY id DESC
        `;
        return res.status(200).json(registrations);
      }
    }

    if (req.method === 'POST') {
      // Public access - Create new registration
      const { eventId, name, email, phone, attendeeCount, comments, language, childrenNames } = req.body;

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
        SELECT id, title, date, time, location, custom_location, max_attendees, current_attendees, type
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

      const sanitizedChildrenNames = childrenNames || null;

      // Create registration
      const newRegistration = await sql`
        INSERT INTO event_registrations (
          event_id, name, email, phone, attendee_count, comments, language, children_names
        ) VALUES (
          ${eventIdNum}, ${sanitizedName}, ${sanitizedEmail}, ${sanitizedPhone},
          ${requestedAttendees}, ${sanitizedComments}, ${sanitizedLanguage}, ${sanitizedChildrenNames}
        )
        RETURNING *
      `;

      // Update event attendee count
      await sql`
        UPDATE events
        SET current_attendees = current_attendees + ${requestedAttendees}
        WHERE id = ${eventIdNum}
      `;

      // For foto events, calculate time slots
      let photoSlots = undefined;
      if (event.type === 'foto' && sanitizedChildrenNames) {
        // Get all existing registrations to count total children before this one
        const allRegistrations = await sql`
          SELECT attendee_count FROM event_registrations
          WHERE event_id = ${eventIdNum} AND id != ${newRegistration[0].id}
        `;
        let totalChildrenBefore = 0;
        for (const reg of allRegistrations) {
          totalChildrenBefore += reg.attendee_count || 1;
        }

        const [hours, minutes] = event.time.split(':').map(Number);
        photoSlots = [];
        for (let i = 0; i < requestedAttendees; i++) {
          const slotMinutes = (totalChildrenBefore + i) * 5;
          const slotDate = new Date(2000, 0, 1, hours, minutes + slotMinutes);
          const slotTime = `${slotDate.getHours().toString().padStart(2, '0')}:${slotDate.getMinutes().toString().padStart(2, '0')}`;
          photoSlots.push(slotTime);
        }
      }

      // Send confirmation email (if configured)
      try {
        await sendEventConfirmationEmail({
          registration: newRegistration[0],
          event: event,
          language: sanitizedLanguage,
          photoSlots: photoSlots
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
  const { registration, event, language, photoSlots } = params;

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
  const locale = isNorwegian ? 'no-NO' : 'en-US';

  // Special email for foto events
  if (event.type === 'foto' && photoSlots && registration.children_names) {
    let childrenNames = [];
    try {
      childrenNames = JSON.parse(registration.children_names);
    } catch {}

    const shortDate = new Date(event.date).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const barnWord = childrenNames.length === 1 ? 'Ditt barn' : 'Dine barn';
    const childWord = childrenNames.length === 1 ? 'Your child' : 'Your children';

    let fotoContent = '';
    if (isNorwegian) {
      fotoContent += `Hei ${registration.name}\n\n`;
      fotoContent += `${barnWord} er nå påmeldt fotografering ${shortDate}\n\n`;
      for (let i = 0; i < childrenNames.length; i++) {
        fotoContent += `${childrenNames[i]} har fått tidspunkt ${photoSlots[i] || 'TBD'}\n`;
      }
      fotoContent += `\nDet er viktig å holde tidsplanen, så vi ber dere møte opp minst 10 minutter før deres tildelte tid.\n\n`;
      fotoContent += `Dersom dere av en eller annen grunn ikke kan stille, vennligst meld i fra til FAU snarest mulig ved å svare på denne eposten.\n\n`;
      fotoContent += `Mvh\nFAU Erdal Barnehage`;
    } else {
      fotoContent += `Hi ${registration.name}\n\n`;
      fotoContent += `${childWord} is now registered for photography on ${shortDate}\n\n`;
      for (let i = 0; i < childrenNames.length; i++) {
        fotoContent += `${childrenNames[i]} has been assigned time slot ${photoSlots[i] || 'TBD'}\n`;
      }
      fotoContent += `\nIt is important to stay on schedule, so please arrive at least 10 minutes before your allotted time.\n\n`;
      fotoContent += `If for any reason you cannot attend, please notify FAU as soon as possible by replying to this email.\n\n`;
      fotoContent += `Best regards\nFAU Erdal Barnehage`;
    }

    const fotoSubject = isNorwegian
      ? `Bekreftelse: Fotografering ${shortDate}`
      : `Confirmation: Photography ${shortDate}`;

    const fotoMailOptions = {
      from: process.env.GMAIL_USER,
      to: registration.email,
      subject: fotoSubject,
      text: fotoContent,
    };

    await transporter.sendMail(fotoMailOptions);
    return;
  }

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
