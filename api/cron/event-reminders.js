import { getDb } from '../_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
} from '../_shared/middleware.js';
import { sendEmail, isEmailConfigured } from '../_shared/email.js';
import { reminderEmail as newsletterReminderEmail } from '../_shared/newsletter.js';
import Sentry from '../_shared/sentry.js';

const MAX_REMINDERS_PER_RUN = 25;
// Upper bound on newsletter emails sent in a single daily run. Comfortably
// above a kindergarten's subscriber count yet well under Gmail's daily ceiling.
const MAX_NEWSLETTER_EMAILS_PER_RUN = 400;

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

async function sendReminder(registration) {
  const { subject, text } = reminderEmail(registration);
  await sendEmail({ to: registration.email, subject, text });
}

// Event descriptions are stored as sanitized HTML; flatten to readable plain
// text for the text-only newsletter email. Calendar descriptions are already
// plain text, so this is a no-op for them.
function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<\/\s*(li|h[1-3])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatLongDate(dateStr, language) {
  const locale = language === 'en' ? 'en-US' : 'no-NO';
  return new Date(dateStr).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Email every confirmed newsletter subscriber about events and day_event
// calendar entries that are flagged and fall on targetDate. Items are claimed
// (newsletter_sent_at stamped) atomically so a re-run never double-sends.
async function broadcastNewsletter(sql, targetDate) {
  const subscribers = await sql`
    SELECT email, language, unsubscribe_token as "unsubscribeToken"
    FROM newsletter_subscribers
    WHERE status = 'active'
  `;

  // Nothing to do without recipients — leave items unclaimed.
  if (subscribers.length === 0) {
    return { items: 0, sent: 0, failed: 0 };
  }

  // Don't claim items if we can't actually send; otherwise they'd be marked as
  // sent while no email went out.
  if (!isEmailConfigured()) {
    return { items: 0, sent: 0, failed: 0, skipped: 'email-not-configured' };
  }

  const now = new Date().toISOString();

  const dueEvents = await sql`
    UPDATE events
    SET newsletter_sent_at = ${now}
    WHERE date = ${targetDate}
      AND status = 'active'
      AND notify_newsletter = true
      AND newsletter_sent_at IS NULL
    RETURNING id, title, description, date
  `;

  const dueEntries = await sql`
    UPDATE yearly_calendar_entries
    SET newsletter_sent_at = ${now}
    WHERE date = ${targetDate}
      AND entry_type = 'day_event'
      AND notify_newsletter = true
      AND newsletter_sent_at IS NULL
    RETURNING id, title, description, date
  `;

  const dueItems = [...dueEvents, ...dueEntries];
  if (dueItems.length === 0) {
    return { items: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  let capped = false;

  for (const item of dueItems) {
    const description = htmlToText(item.description);
    for (const subscriber of subscribers) {
      if (sent + failed >= MAX_NEWSLETTER_EMAILS_PER_RUN) {
        capped = true;
        break;
      }
      try {
        const { subject, text } = newsletterReminderEmail({
          title: item.title,
          description,
          dateText: formatLongDate(item.date, subscriber.language),
          language: subscriber.language,
          unsubscribeToken: subscriber.unsubscribeToken,
        });
        await sendEmail({ to: subscriber.email, subject, text });
        sent += 1;
      } catch (emailError) {
        failed += 1;
        console.error('Failed to send newsletter email:', emailError.message);
        if (process.env.NODE_ENV === 'production') {
          Sentry.captureException(emailError);
        }
      }
    }
    if (capped) break;
  }

  if (capped && process.env.NODE_ENV === 'production') {
    Sentry.captureMessage(`Newsletter broadcast hit per-run cap of ${MAX_NEWSLETTER_EMAILS_PER_RUN}`);
  }

  return { items: dueItems.length, sent, failed, capped };
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

    // The evening run (21:00 Oslo / 19:00 UTC) only broadcasts the newsletter
    // for the next day's flagged events. Registration reminders + GDPR cleanup
    // stay on the morning run (07:00 UTC).
    if (req.query.task === 'newsletter') {
      const newsletter = await broadcastNewsletter(sql, targetDate);
      return res.status(200).json({ success: true, targetDate, task: 'newsletter', newsletter });
    }

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

    let sent = 0;
    let failed = 0;

    if (claimed.length > 0) {
      if (!isEmailConfigured()) {
        throw new Error('Email configuration not available');
      }

      for (const registration of claimed) {
        try {
          await sendReminder(registration);
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
    }

    const retention = await cleanupPrivacyRetention(sql);
    return res.status(200).json({ success: true, targetDate, sent, failed, retention });
  } catch (error) {
    return handleError(res, error);
  }
}
