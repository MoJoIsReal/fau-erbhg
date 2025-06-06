import { neon } from '@neondatabase/serverless';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!process.env.DATABASE_URL) {
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const sql = neon(process.env.DATABASE_URL);

    if (req.method === 'GET') {
      const { eventId } = req.query;
      
      if (!eventId || isNaN(parseInt(eventId))) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      const eventIdNum = parseInt(eventId);
      
      // Get registrations for an event
      const registrations = await sql`
        SELECT id, name, email, phone, attendee_count, comments, language
        FROM event_registrations 
        WHERE event_id = ${eventIdNum}
        ORDER BY id DESC
      `;

      return res.status(200).json(registrations);
    }

    if (req.method === 'POST') {
      // Create new registration
      const { eventId, name, email, phone, attendeeCount, comments, language } = req.body;

      if (!eventId || !name || !email) {
        return res.status(400).json({ error: 'Event ID, name and email are required' });
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
      const requestedAttendees = attendeeCount || 1;

      // Check if email already registered for this event
      const existingRegistrations = await sql`
        SELECT id FROM event_registrations 
        WHERE event_id = ${eventIdNum} AND email = ${email}
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
          ${eventIdNum}, ${name}, ${email}, ${phone || null}, 
          ${requestedAttendees}, ${comments || null}, ${language || 'no'}
        )
        RETURNING *
      `;

      // Update event attendee count
      await sql`
        UPDATE events 
        SET current_attendees = current_attendees + ${requestedAttendees}
        WHERE id = ${eventIdNum}
      `;

      // Send confirmation email
      try {
        await sendEventConfirmationEmail({
          registration: newRegistration[0],
          event: event,
          language: language || 'no'
        });
        console.log('Event confirmation email sent successfully');
      } catch (emailError) {
        console.error('Failed to send event confirmation email:', emailError);
        // Don't fail the request if email fails, just log it
      }

      return res.status(201).json(newRegistration[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Registrations API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendEventConfirmationEmail(params) {
  const { registration, event, language } = params;
  
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