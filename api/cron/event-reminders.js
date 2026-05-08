import nodemailer from 'nodemailer';
import { getDb } from '../_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
} from '../_shared/middleware.js';
import Sentry from '../_shared/sentry.js';

const MAX_REMINDERS_PER_RUN = 25;

function isAuthorizedCron(req) {
  if (!process.env.CRON_SECRET) {
    return process.env.NODE_ENV !== 'production';
  }
  return req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
}

function formatOsloDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function tomorrowInOslo() {
  return formatOsloDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function createTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Email configuration not available');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function reminderEmail(registration) {
  const isNorwegian = registration.language !== 'en';
  const locale = isNorwegian ? 'no-NO' : 'en-US';
  const date = new Date(registration.eventDate).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const location = registration.customLocation
    ? `${registration.location} (${registration.customLocation})`
    : registration.location;

  const subject = isNorwegian
    ? `Påminnelse: ${registration.eventTitle} i morgen`
    : `Reminder: ${registration.eventTitle} tomorrow`;

  const text = isNorwegian ? `
Hei ${registration.name},

Dette er en påminnelse om at du er påmeldt "${registration.eventTitle}" i morgen.

Arrangementsinformasjon:
- Dato: ${date}
- Tid: ${registration.eventTime}
- Sted: ${location}
- Antall deltakere: ${registration.attendeeCount || 1}

${registration.photoSlots ? `Fototidspunkt: ${registration.photoSlots}\n\n` : ''}Vi gleder oss til å se deg!

Med vennlig hilsen,
FAU Erdal Barnehage
` : `
Hi ${registration.name},

This is a reminder that you are registered for "${registration.eventTitle}" tomorrow.

Event information:
- Date: ${date}
- Time: ${registration.eventTime}
- Location: ${location}
- Number of attendees: ${registration.attendeeCount || 1}

${registration.photoSlots ? `Photo slot: ${registration.photoSlots}\n\n` : ''}We look forward to seeing you!

Best regards,
FAU Erdal Barnehage
`;

  return { subject, text };
}

async function sendReminder(transporter, registration) {
  const { subject, text } = reminderEmail(registration);
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: registration.email,
    subject,
    text,
  });
}

async function cleanupPrivacyRetention(sql) {
  const deletedContactMessages = await sql`
    DELETE FROM contact_messages
    WHERE created_at::timestamptz < NOW() - INTERVAL '12 months'
    RETURNING id
  `;

  const deletedRegistrations = await sql`
    DELETE FROM event_registrations r
    USING events e
    WHERE e.id = r.event_id
      AND e.date::date < CURRENT_DATE - INTERVAL '6 months'
    RETURNING r.id
  `;

  return {
    contactMessagesDeleted: deletedContactMessages.length,
    eventRegistrationsDeleted: deletedRegistrations.length,
  };
}

export default async function handler(req, res) {
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sql = getDb();
    const targetDate = req.query.date || tomorrowInOslo();
    const claimTimestamp = new Date().toISOString();

    const claimed = await sql`
      WITH due AS (
        SELECT
          r.id,
          r.name,
          r.email,
          r.language,
          r.attendee_count as "attendeeCount",
          r.photo_slots as "photoSlots",
          e.title as "eventTitle",
          e.date as "eventDate",
          e.time as "eventTime",
          e.location,
          e.custom_location as "customLocation"
        FROM event_registrations r
        JOIN events e ON e.id = r.event_id
        WHERE e.status = 'active'
          AND e.date = ${targetDate}
          AND r.reminder_sent_at IS NULL
        ORDER BY e.time ASC, r.id ASC
        LIMIT ${MAX_REMINDERS_PER_RUN}
      ),
      claimed AS (
        UPDATE event_registrations r
        SET reminder_sent_at = ${claimTimestamp}
        FROM due
        WHERE r.id = due.id
        RETURNING r.id
      )
      SELECT due.*
      FROM due
      JOIN claimed ON claimed.id = due.id
    `;

    if (claimed.length === 0) {
      const retention = await cleanupPrivacyRetention(sql);
      return res.status(200).json({ success: true, targetDate, sent: 0, failed: 0, retention });
    }

    const transporter = createTransporter();
    let sent = 0;
    let failed = 0;

    for (const registration of claimed) {
      try {
        await sendReminder(transporter, registration);
        sent += 1;
      } catch (emailError) {
        failed += 1;
        await sql`
          UPDATE event_registrations
          SET reminder_sent_at = NULL
          WHERE id = ${registration.id}
        `;
        console.error('Failed to send event reminder:', emailError.message);
        if (process.env.NODE_ENV === 'production') {
          Sentry.captureException(emailError);
        }
      }
    }

    const retention = await cleanupPrivacyRetention(sql);
    return res.status(200).json({ success: true, targetDate, sent, failed, retention });
  } catch (error) {
    return handleError(res, error);
  }
}
