import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  parseAuthToken,
  requireCsrf,
  requireRole,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNumber
} from './_shared/middleware.js';
import { assignPhotoSlots } from '../shared/photo-slots.js';
import { checkRateLimit, rateLimitKey } from './_shared/rate-limit.js';
import { sendEmail, isEmailConfigured } from './_shared/email.js';
import Sentry from './_shared/sentry.js';
import { COUNCIL_ROLES } from '../shared/constants.js';

const REGISTRATION_WINDOW_SECONDS = 10 * 60;
const REGISTRATION_MAX_ATTEMPTS = 10;
const MAX_CHILD_NAME_LENGTH = 100;

// Children names arrive as a JSON-stringified array from the client. Never trust
// it: parse, enforce it's an array of strings, sanitize each name, and cap both
// the per-name length and the count so a crafted request can't store malformed
// JSON or bloat the table.
function sanitizeChildrenNames(raw, maxCount) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const cap = Number.isFinite(maxCount) && maxCount > 0 ? Math.min(maxCount, 100) : 100;
  const cleaned = parsed
    .slice(0, cap)
    .map((name) => sanitizeText(String(name ?? ''), MAX_CHILD_NAME_LENGTH))
    .filter((name) => name.length > 0);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

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
      const user = await parseAuthToken(req, sql);

      if (user) {
        if (!COUNCIL_ROLES.includes(user.role)) {
          return res.status(403).json({ error: 'Council member access required' });
        }

        // Council view - return full registration details
        const registrations = await sql`
          SELECT id, event_id as "eventId", name, email, phone,
                 attendee_count as "attendeeCount", comments,
                 registered_at as "registeredAt",
                 children_names as "childrenNames",
                 photo_slots as "photoSlots"
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
          ORDER BY registered_at DESC
        `;
        return res.status(200).json(registrations);
      } else {
        // Public access - return aggregate only. Never expose registration PII.
        const totals = await sql`
          SELECT COALESCE(SUM(attendee_count), 0)::int as count
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
        `;
        return res.status(200).json({ count: totals[0]?.count || 0 });
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
        try {
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
        } catch (blacklistError) {
          // Table may not exist yet or have different schema — skip check, don't block registration.
          // Surface to Sentry so silent spam-filter degradation is noticed instead of slowly missed.
          console.warn('Email blacklist check failed, skipping:', blacklistError.message);
          if (process.env.NODE_ENV === 'production') {
            Sentry.captureException(blacklistError);
          }
        }
      }

      const eventIdNum = parseInt(eventId);

      if (isNaN(eventIdNum)) {
        return res.status(400).json({ error: 'Valid event ID required' });
      }

      const registrationRateLimitKey = rateLimitKey(req, 'register', `${eventIdNum}:${sanitizedEmail}`);
      const registrationIpRateLimitKey = rateLimitKey(req, 'register-ip', '');
      const [registrationRateLimit, registrationIpRateLimit] = await Promise.all([
        checkRateLimit(sql, {
          key: registrationRateLimitKey,
          limit: REGISTRATION_MAX_ATTEMPTS,
          windowSeconds: REGISTRATION_WINDOW_SECONDS
        }),
        checkRateLimit(sql, {
          key: registrationIpRateLimitKey,
          limit: REGISTRATION_MAX_ATTEMPTS,
          windowSeconds: REGISTRATION_WINDOW_SECONDS
        })
      ]);

      if (!registrationRateLimit.allowed || !registrationIpRateLimit.allowed) {
        res.setHeader(
          'Retry-After',
          String(Math.max(registrationRateLimit.retryAfter, registrationIpRateLimit.retryAfter))
        );
        return res.status(429).json({
          error: sanitizedLanguage === 'no'
            ? 'For mange påmeldinger fra denne enheten. Prøv igjen senere.'
            : 'Too many registrations from this device. Try again later.'
        });
      }

      // Check if event exists and is active
      const nowIso = new Date().toISOString();
      const events = await sql`
        SELECT id, title, date, time, location, custom_location, max_attendees, current_attendees,
               registration_deadline, type, no_signup, vigilo_signup
        FROM events
        WHERE id = ${eventIdNum} AND status = 'active'
      `;

      if (events.length === 0) {
        return res.status(404).json({ error: 'Event not found or not active' });
      }

      const event = events[0];
      if (event.no_signup || event.vigilo_signup) {
        return res.status(400).json({
          error: sanitizedLanguage === 'no'
            ? 'Påmelding er ikke tillatt for dette arrangementet'
            : 'Registration is not available for this event'
        });
      }

      if (event.registration_deadline && event.registration_deadline < nowIso) {
        return res.status(400).json({
          error: sanitizedLanguage === 'no'
            ? 'Påmeldingsfristen har gått ut'
            : 'The registration deadline has passed'
        });
      }

      const requestedAttendees = sanitizedAttendeeCount;

      const sanitizedChildrenNames = sanitizeChildrenNames(childrenNames, requestedAttendees);

      // For foto events, assign 5-minute time slots (gap-filling) before insert so we persist them.
      let photoSlots = undefined;
      let photoSlotsJson = null;
      if (event.type === 'foto' && sanitizedChildrenNames) {
        const existingForSlots = await sql`
          SELECT id, attendee_count as "attendeeCount",
                 children_names as "childrenNames",
                 photo_slots as "photoSlots"
          FROM event_registrations
          WHERE event_id = ${eventIdNum}
        `;
        photoSlots = assignPhotoSlots(event, existingForSlots, requestedAttendees);
        photoSlotsJson = JSON.stringify(photoSlots);
      }

      // Always bind children_names and photo_slots — null when this isn't a
      // foto event so a single CTE handles both cases.
      const childrenNamesParam = sanitizedChildrenNames ?? null;
      const photoSlotsParam = photoSlotsJson ?? null;

      const registrationResult = await sql`
        WITH target_event AS (
          SELECT *
          FROM events
          WHERE id = ${eventIdNum} AND status = 'active'
            AND COALESCE(no_signup, false) = false
            AND COALESCE(vigilo_signup, false) = false
            AND (registration_deadline IS NULL OR registration_deadline = '' OR registration_deadline >= ${nowIso})
        ),
        capacity_update AS (
          UPDATE events
          SET current_attendees = current_attendees + ${requestedAttendees}
          WHERE id = ${eventIdNum}
            AND EXISTS (SELECT 1 FROM target_event)
            AND (
              (SELECT type FROM target_event) = 'foto'
              OR (SELECT max_attendees FROM target_event) IS NULL
              OR COALESCE(current_attendees, 0) + ${requestedAttendees} <= (SELECT max_attendees FROM target_event)
            )
          RETURNING *
        ),
        inserted_registration AS (
          INSERT INTO event_registrations (
            event_id, name, email, phone, attendee_count, comments, language, children_names, photo_slots
          )
          SELECT
            ${eventIdNum}, ${sanitizedName}, ${sanitizedEmail}, ${sanitizedPhone},
            ${requestedAttendees}, ${sanitizedComments}, ${sanitizedLanguage},
            ${childrenNamesParam}, ${photoSlotsParam}
          WHERE EXISTS (SELECT 1 FROM capacity_update)
            AND NOT EXISTS (
              SELECT 1 FROM event_registrations
              WHERE event_id = ${eventIdNum} AND lower(email) = lower(${sanitizedEmail})
            )
          ON CONFLICT DO NOTHING
          RETURNING *
        ),
        rollback_capacity AS (
          UPDATE events
          SET current_attendees = GREATEST(0, current_attendees - ${requestedAttendees})
          WHERE id = ${eventIdNum}
            AND EXISTS (SELECT 1 FROM capacity_update)
            AND NOT EXISTS (SELECT 1 FROM inserted_registration)
          RETURNING id
        )
        SELECT
          (SELECT COUNT(*)::int FROM target_event) AS "eventExists",
          (SELECT COUNT(*)::int FROM capacity_update) AS "capacityReserved",
          (SELECT GREATEST(0, max_attendees - COALESCE(current_attendees, 0)) FROM target_event) AS "available",
          (SELECT row_to_json(capacity_update) FROM capacity_update) AS event,
          (SELECT row_to_json(inserted_registration) FROM inserted_registration) AS registration
      `;

      const registrationState = registrationResult[0];
      if (!registrationState?.eventExists) {
        return res.status(404).json({ error: 'Event not found or not active' });
      }

      if (!registrationState.capacityReserved) {
        return res.status(400).json({
          error: 'Event is at capacity',
          available: registrationState.available || 0
        });
      }

      if (!registrationState.registration) {
        return res.status(400).json({
          error: 'This email is already registered for this event'
        });
      }

      const newRegistration = [registrationState.registration];
      const updatedEvent = registrationState.event || event;

      // Send confirmation email (if configured)
      try {
        await sendEventConfirmationEmail({
          registration: newRegistration[0],
          event: updatedEvent,
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
      const user = await requireRole(req, res, COUNCIL_ROLES, sql);
      if (!user) return;

      // CSRF protection for state-changing requests
      if (!requireCsrf(req, res)) return;

      const { id } = req.query;

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ error: 'Valid registration ID required' });
      }

      const deletedReg = await sql`
        DELETE FROM event_registrations WHERE id = ${parseInt(id)} RETURNING event_id, attendee_count
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

  if (!isEmailConfigured()) {
    console.warn('Email configuration missing: GMAIL_USER and GMAIL_APP_PASSWORD must be set');
    throw new Error('Email configuration not available');
  }

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

    let fotoContent = '';
    if (isNorwegian) {
      fotoContent += `Hei ${registration.name}\n\n`;
      fotoContent += `Ditt barn er nå påmeldt fotografering ${shortDate}\n\n`;
      for (let i = 0; i < childrenNames.length; i++) {
        fotoContent += `${childrenNames[i]} har fått tidspunkt ${photoSlots[i] || 'TBD'}\n`;
      }
      fotoContent += `\nDersom dere av en eller annen grunn ikke kan stille, vennligst meld i fra til FAU snarest mulig ved å svare på denne eposten.\n\n`;
      fotoContent += `Mvh\nFAU Erdal Barnehage`;
    } else {
      fotoContent += `Hi ${registration.name}\n\n`;
      fotoContent += `Your child is now registered for photography on ${shortDate}\n\n`;
      for (let i = 0; i < childrenNames.length; i++) {
        fotoContent += `${childrenNames[i]} has been assigned time slot ${photoSlots[i] || 'TBD'}\n`;
      }
      fotoContent += `\nIf for any reason you cannot attend, please notify FAU as soon as possible by replying to this email.\n\n`;
      fotoContent += `Best regards\nFAU Erdal Barnehage`;
    }

    const fotoSubject = isNorwegian
      ? `Bekreftelse: Fotografering ${shortDate}`
      : `Confirmation: Photography ${shortDate}`;

    await sendEmail({ to: registration.email, subject: fotoSubject, text: fotoContent });
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

  await sendEmail({ to: registration.email, subject, text: emailContent });
}
