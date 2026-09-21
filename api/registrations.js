import { waitUntil } from '@vercel/functions';
import { getDb } from './_shared/database.js';
import {
  withApiHandler,
  parseAuthToken,
  requireCsrf,
  requireRole,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  sanitizeNumber,
  findOversizedField
} from './_shared/middleware.js';
import { assignPhotoSlots } from '../shared/photo-slots.js';
import { checkRateLimit, rateLimitKey } from './_shared/rate-limit.js';
import { sendEmail, isEmailConfigured } from './_shared/email.js';
import Sentry from './_shared/sentry.js';
import { reportProviderError } from './_shared/provider-errors.js';
import { COUNCIL_ROLES } from '../shared/constants.js';

const REGISTRATION_WINDOW_SECONDS = 10 * 60;
const REGISTRATION_MAX_ATTEMPTS = 10;
const MAX_CHILD_NAME_LENGTH = 100;
const PHOTO_SLOT_ALLOCATION_ATTEMPTS = 3;

export function isPhotoSlotConflict(error) {
  return error?.code === '23505'
    && error?.constraint === 'photo_event_slots_event_slot_unique_idx';
}

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

export default withApiHandler(async function handler(req, res) {
  const sql = getDb();

  if (req.method === 'GET') {
    const { eventId } = req.query;

    if (!eventId || isNaN(parseInt(eventId))) {
      return res.status(400).json({ error: 'Valid event ID required' });
    }

    const eventIdNum = parseInt(eventId);

    // Council members (with a valid session, no pending password change) get
    // full registration details. Everyone else — anonymous visitors, or an
    // authenticated non-council user like staff — gets the same public
    // aggregate. Authentication must never make a public endpoint stricter.
    const user = await parseAuthToken(req, sql);
    const isCouncilMember = user && !user.passwordChangeRequired && COUNCIL_ROLES.includes(user.role);

    if (isCouncilMember) {
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

    // Public and unauthenticated: refuse an abusive body, then let the per-IP
    // limiter see the request, before spending anything on sanitization.
    // `childrenNames` in particular is a JSON array that fans out to up to 100
    // separate sanitizeText calls.
    const oversizedField = findOversizedField(req.body);
    if (oversizedField) {
      return res.status(413).json({ error: `Field '${oversizedField}' is too large` });
    }

    const registrationIpRateLimit = await checkRateLimit(sql, {
      key: rateLimitKey(req, 'register-ip', ''),
      limit: REGISTRATION_MAX_ATTEMPTS,
      windowSeconds: REGISTRATION_WINDOW_SECONDS
    });
    if (!registrationIpRateLimit.allowed) {
      res.setHeader('Retry-After', String(registrationIpRateLimit.retryAfter));
      return res.status(429).json({
        // `language` is still raw here — sanitization happens below, after the
        // limiter. Only an exact 'en' switches language; anything else falls
        // back to Norwegian, same as sanitizedLanguage would.
        error: language === 'en'
          ? 'Too many registrations from this device. Try again later.'
          : 'For mange påmeldinger fra denne enheten. Prøv igjen senere.'
      });
    }

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

    // Per-(IP, event, email) limit: needs the sanitized address, so it runs
    // after sanitization. The per-IP limit at the top of this branch already
    // bounded the work an unthrottled caller could cause.
    const registrationRateLimitKey = rateLimitKey(req, 'register', `${eventIdNum}:${sanitizedEmail}`);
    const registrationRateLimit = await checkRateLimit(sql, {
      key: registrationRateLimitKey,
      limit: REGISTRATION_MAX_ATTEMPTS,
      windowSeconds: REGISTRATION_WINDOW_SECONDS
    });

    if (!registrationRateLimit.allowed) {
      res.setHeader('Retry-After', String(registrationRateLimit.retryAfter));
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

    // Photo slots are first proposed from the current registration snapshot, then
    // reserved by a unique (event_id, slot) database index in the same statement
    // as the registration. A concurrent winner makes the loser retry from a fresh
    // snapshot rather than persisting a duplicate appointment.
    let photoSlots = undefined;
    const childrenNamesParam = sanitizedChildrenNames ?? null;
    let registrationResult;

    for (let allocationAttempt = 1; allocationAttempt <= PHOTO_SLOT_ALLOCATION_ATTEMPTS; allocationAttempt += 1) {
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

      const photoSlotsParam = photoSlotsJson ?? null;

      try {
        registrationResult = await sql`
          WITH target_event AS (
            SELECT *
            FROM events
            WHERE id = ${eventIdNum} AND status = 'active'
              AND COALESCE(no_signup, false) = false
              AND COALESCE(vigilo_signup, false) = false
              AND (registration_deadline IS NULL OR registration_deadline = '' OR registration_deadline >= ${nowIso})
            -- Locks the event row for the duration of this statement, so two
            -- parents racing for the last seat are serialized: the second one
            -- re-reads current_attendees after the first commits. The row mark
            -- also stops PostgreSQL inlining this CTE, so it is evaluated once.
            FOR UPDATE
          ),
          capacity_available AS (
            SELECT EXISTS (
              SELECT 1 FROM target_event
              WHERE type = 'foto'
                 OR max_attendees IS NULL
                 OR COALESCE(current_attendees, 0) + ${requestedAttendees} <= max_attendees
            ) AS ok
          ),
          inserted_registration AS (
            INSERT INTO event_registrations (
              event_id, name, email, phone, attendee_count, comments, language, children_names, photo_slots
            )
            SELECT
              ${eventIdNum}, ${sanitizedName}, ${sanitizedEmail}, ${sanitizedPhone},
              ${requestedAttendees}, ${sanitizedComments}, ${sanitizedLanguage},
              ${childrenNamesParam}, ${photoSlotsParam}
            WHERE EXISTS (SELECT 1 FROM target_event)
              AND (SELECT ok FROM capacity_available)
              AND NOT EXISTS (
                SELECT 1 FROM event_registrations
                WHERE event_id = ${eventIdNum} AND lower(email) = lower(${sanitizedEmail})
              )
            ON CONFLICT DO NOTHING
            RETURNING *
          ),
          reserved_slots AS (
            INSERT INTO photo_event_slots (event_id, registration_id, slot)
            SELECT ${eventIdNum}, r.id, slots.slot
            FROM inserted_registration r
            CROSS JOIN LATERAL jsonb_array_elements_text(
              COALESCE(${photoSlotsParam}::text, '[]')::jsonb
            ) AS slots(slot)
            RETURNING id
          ),
          capacity_update AS (
            -- The ONLY write to the events row in this statement, and it happens
            -- only if a registration was actually inserted. The previous shape
            -- incremented first and tried to undo that with a second UPDATE of
            -- the same row; PostgreSQL does not apply a second update to a row
            -- already updated by the same statement (see the manual, 7.8.2
            -- "Data-Modifying Statements in WITH"), so the compensating update
            -- was silently skipped and every duplicate signup permanently
            -- consumed a seat.
            UPDATE events
            SET current_attendees = COALESCE(current_attendees, 0) + ${requestedAttendees}
            WHERE id = ${eventIdNum}
              AND EXISTS (SELECT 1 FROM inserted_registration)
            RETURNING *
          )
          SELECT
            (SELECT COUNT(*)::int FROM target_event) AS "eventExists",
            (SELECT ok FROM capacity_available) AS "capacityAvailable",
            (SELECT GREATEST(0, max_attendees - COALESCE(current_attendees, 0)) FROM target_event) AS "available",
            (SELECT COUNT(*)::int FROM reserved_slots) AS "reservedSlotCount",
            (SELECT row_to_json(capacity_update) FROM capacity_update) AS event,
            (SELECT row_to_json(inserted_registration) FROM inserted_registration) AS registration
        `;
        break;
      } catch (error) {
        if (!isPhotoSlotConflict(error)) throw error;
        if (allocationAttempt === PHOTO_SLOT_ALLOCATION_ATTEMPTS) {
          return res.status(409).json({
            error: sanitizedLanguage === 'no'
              ? 'Fototiden ble nettopp tatt. Prøv på nytt.'
              : 'The photo slot was just taken. Please try again.'
          });
        }
      }
    }

    const registrationState = registrationResult[0];
    if (!registrationState?.eventExists) {
      return res.status(404).json({ error: 'Event not found or not active' });
    }

    if (!registrationState.capacityAvailable) {
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

    // Send confirmation email (if configured). Never fails the request, so
    // there's no reason to make the caller wait on Gmail's response time —
    // waitUntil() lets it finish after the response is already sent.
    waitUntil(
      sendEventConfirmationEmail({
        registration: newRegistration[0],
        event: updatedEvent,
        language: sanitizedLanguage,
        photoSlots: photoSlots
      })
        .then(() => console.log('Event confirmation email sent successfully'))
        .catch((emailError) => {
          reportProviderError('Failed to send event confirmation email', emailError);
        })
    );

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
      WITH deleted AS (
        DELETE FROM event_registrations
        WHERE id = ${parseInt(id)}
        RETURNING id, event_id, attendee_count
      ), updated_event AS (
        UPDATE events e
        SET current_attendees = GREATEST(0, COALESCE(e.current_attendees, 0) - COALESCE(d.attendee_count, 1))
        FROM deleted d
        WHERE e.id = d.event_id
        RETURNING e.id
      )
      SELECT d.id, d.event_id, d.attendee_count,
             EXISTS (SELECT 1 FROM updated_event) as "eventUpdated"
      FROM deleted d
    `;

    if (deletedReg.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});

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
