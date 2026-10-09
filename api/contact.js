import { waitUntil } from '@vercel/functions';
import { getDb } from './_shared/database.js';
import {
  withApiHandler,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
  findOversizedField,
} from './_shared/middleware.js';
import { checkRateLimit, rateLimitKey, sendPublicMail } from './_shared/rate-limit.js';
import { sendEmail, isEmailConfigured } from './_shared/email.js';
import { confirmationEmail, NEWSLETTER_CONFIRM_DAYS, newsletterToken } from './_shared/newsletter.js';
import { contactAcknowledgementEmail, contactSubjectLabel } from './_shared/contact-emails.js';
import { reportProviderError } from './_shared/provider-errors.js';
import { turnstileFailure, verifyTurnstile } from './_shared/turnstile.js';

const CONTACT_WINDOW_SECONDS = 10 * 60;
const CONTACT_MAX_ATTEMPTS = 3;
const TOKEN_RE = /^[a-f0-9]{64}$/;

export default withApiHandler(async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Public newsletter ("nyhetsbrev") actions are multiplexed onto this function
  // to stay within the Vercel Hobby serverless-function budget. They share the
  // same public, CSRF-free posture as the contact form (honeypot + rate limit).
  const { action } = req.query;
  if (action === 'newsletter-subscribe') return handleNewsletterSubscribe(req, res);
  if (action === 'newsletter-confirm') return handleNewsletterConfirm(req, res);
  if (action === 'newsletter-unsubscribe') return handleNewsletterUnsubscribe(req, res);

  const { name, email, phone, subject, message, website, language } = req.body;

  // Honeypot: humans never see/fill this field.
  if (website) {
    return res.status(204).end();
  }

  // Refuse an abusive body before spending anything on it. This endpoint is
  // public and unauthenticated, so the cheapest checks go first.
  const oversizedField = findOversizedField(req.body);
  if (oversizedField) {
    return res.status(413).json({ error: `Field '${oversizedField}' is too large`, code: 'FIELD_TOO_LARGE' });
  }

  // Validate required fields
  if (!subject || !message) {
    return res.status(400).json({
      error: 'Subject and message are required',
      code: 'MESSAGE_REQUIRED',
    });
  }

  // Validate subject is one of allowed values
  const allowedSubjects = ['anonymous', 'general', 'concern', 'feedback'];
  if (!allowedSubjects.includes(subject)) {
    return res.status(400).json({
      error: 'Invalid subject type',
      code: 'MESSAGE_REQUIRED',
    });
  }

  const sql = getDb();

  // The per-IP limit needs no sanitized value, so it runs before sanitization
  // rather than after it. Previously every request — including the 400th from
  // one address — was fully sanitized before the limiter was consulted, which
  // meant the limiter could not protect the work it was meant to bound.
  const ipRateLimit = await checkRateLimit(sql, {
    key: rateLimitKey(req, 'contact-ip', ''),
    limit: CONTACT_MAX_ATTEMPTS,
    windowSeconds: CONTACT_WINDOW_SECONDS
  });
  if (!ipRateLimit.allowed) {
    res.setHeader('Retry-After', String(ipRateLimit.retryAfter));
    return res.status(429).json({ error: 'Too many messages. Try again later.', code: 'RATE_LIMITED' });
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
      error: 'Valid name and email are required for non-anonymous submissions',
      code: 'NAME_AND_EMAIL_REQUIRED',
    });
  }

  if (!sanitizedMessage) {
    return res.status(400).json({
      error: 'Valid message is required',
      code: 'MESSAGE_REQUIRED',
    });
  }

  // Per-identifier limit: needs the sanitized address, so it necessarily runs
  // after sanitization. The IP limit above already bounded the work.
  const contactIdentifier = isAnonymous ? 'anonymous' : sanitizedEmail;
  const rateLimit = await checkRateLimit(sql, {
    key: rateLimitKey(req, 'contact', contactIdentifier),
    limit: CONTACT_MAX_ATTEMPTS,
    windowSeconds: CONTACT_WINDOW_SECONDS
  });

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfter));
    return res.status(429).json({ error: 'Too many messages. Try again later.', code: 'RATE_LIMITED' });
  }

  if (!(await verifyTurnstile(req, req.body?.turnstileToken, 'contact'))) {
    return res.status(400).json(turnstileFailure(language));
  }

  // Create contact message in database. created_at is text holding ISO
  // 8601, like every other date column here; NOW() stored PostgreSQL's own
  // text form, which the inbox then had to parse.
  const contactMessages = await sql`
    INSERT INTO contact_messages (name, email, phone, subject, message, created_at)
    VALUES (${sanitizedName}, ${sanitizedEmail}, ${sanitizedPhone}, ${subject}, ${sanitizedMessage}, ${new Date().toISOString()})
    RETURNING *
  `;

  const contactMessage = contactMessages[0];

  // Send email notification (if configured). Never fails the request, so
  // there's no reason to make the caller wait on Gmail's response time —
  // waitUntil() lets it finish after the response is already sent.
  waitUntil(
    sendPublicMail(sql, 'contact-notification', () => sendContactEmail({
      name: isAnonymous ? 'Anonym' : sanitizedName,
      email: isAnonymous ? 'noreply@example.com' : sanitizedEmail,
      phone: sanitizedPhone,
      subject,
      message: sanitizedMessage,
      isAnonymous
    }))
      .then((sent) => sent && console.log('Contact email sent successfully'))
      .catch((emailError) => {
        reportProviderError('Failed to send contact email', emailError);
      })
  );

  // Auto-reply to the sender so they know the inquiry arrived. Anonymous
  // submissions have no address to answer, and a failed receipt must never
  // turn a stored inquiry into an error for the parent.
  if (!isAnonymous && sanitizedEmail) {
    waitUntil(
      sendPublicMail(sql, 'contact-acknowledgement', () => sendAcknowledgementEmail({
        name: sanitizedName,
        email: sanitizedEmail,
        subject,
        language: language === 'en' ? 'en' : 'no',
        receivedAt: contactMessage?.created_at,
      }))
        .then((sent) => sent && console.log('Contact acknowledgement sent successfully'))
        .catch((emailError) => {
          reportProviderError('Failed to send contact acknowledgement', emailError);
        })
    );
  }

  // Only that it arrived: the stored row (name, e-mail, phone, message) is
  // not echoed back to whoever submitted the form.
  return res.status(201).json({ success: true });
});

async function sendContactEmail(params) {
  const { name, email, phone, message, isAnonymous } = params;
  const subject = contactSubjectLabel(params.subject, 'no');

  if (!isEmailConfigured()) {
    console.warn('Email configuration missing: GMAIL_USER and GMAIL_APP_PASSWORD must be set');
    throw new Error('Email configuration not available');
  }

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

  await sendEmail({
    to: process.env.GMAIL_USER,
    subject: `Ny henvendelse: ${subject}`,
    text: emailContent,
  });
}

// Receipt to the person who submitted the form, sent from FAU's own address.
async function sendAcknowledgementEmail({ name, email, subject, language, receivedAt }) {
  if (!isEmailConfigured()) {
    console.warn('Email configuration missing: skipping contact acknowledgement');
    return;
  }

  const { subject: mailSubject, text } = contactAcknowledgementEmail({
    name,
    subject,
    language,
    receivedAt,
  });

  await sendEmail({ to: email, subject: mailSubject, text });
}

// POST /api/contact?action=newsletter-subscribe
// Double opt-in: store the address as "pending" and email a confirmation link.
// Always answers with a generic success so the endpoint can't be used to probe
// which addresses are already subscribed.
async function handleNewsletterSubscribe(req, res) {
  const { email, name, language, website } = req.body || {};

  // Honeypot: humans never see/fill this field.
  if (website) {
    return res.status(204).end();
  }

  // Public and unauthenticated, same as the contact form above: refuse an
  // abusive body before sanitizing anything.
  const oversizedField = findOversizedField(req.body);
  if (oversizedField) {
    return res.status(413).json({ error: `Field '${oversizedField}' is too large`, code: 'FIELD_TOO_LARGE' });
  }

  const sanitizedEmail = sanitizeEmail(email);
  if (!sanitizedEmail) {
    return res.status(400).json({ error: 'Valid email is required', code: 'INVALID_EMAIL' });
  }

  const sanitizedName = name ? sanitizeText(name, 100) : null;
  const lang = language === 'en' ? 'en' : 'no';

  const sql = getDb();
  const [emailLimit, ipLimit] = await Promise.all([
    checkRateLimit(sql, {
      key: rateLimitKey(req, 'newsletter', sanitizedEmail),
      limit: CONTACT_MAX_ATTEMPTS,
      windowSeconds: CONTACT_WINDOW_SECONDS,
    }),
    checkRateLimit(sql, {
      key: rateLimitKey(req, 'newsletter-ip', ''),
      limit: CONTACT_MAX_ATTEMPTS,
      windowSeconds: CONTACT_WINDOW_SECONDS,
    }),
  ]);

  if (!emailLimit.allowed || !ipLimit.allowed) {
    res.setHeader('Retry-After', String(Math.max(emailLimit.retryAfter, ipLimit.retryAfter)));
    return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
  }

  if (!(await verifyTurnstile(req, req.body?.turnstileToken, 'newsletter'))) {
    return res.status(400).json(turnstileFailure(lang));
  }

  const now = new Date().toISOString();
  const confirmToken = newsletterToken();
  // One statement: a new address is inserted, a pending or unsubscribed one
  // is re-armed with a fresh token, and an active one is left alone (no row
  // comes back, so nothing is resent). This used to be a lookup followed by
  // an INSERT, and two sign-ups for the same new address at once both
  // missed in the lookup — the second INSERT was a unique violation and a
  // 500.
  const armed = await sql`
    INSERT INTO newsletter_subscribers (email, name, language, status, confirm_token, unsubscribe_token, created_at)
    VALUES (${sanitizedEmail}, ${sanitizedName}, ${lang}, 'pending', ${confirmToken}, ${newsletterToken()}, ${now})
    ON CONFLICT (email) DO UPDATE
      SET status = 'pending',
          confirm_token = EXCLUDED.confirm_token,
          language = EXCLUDED.language,
          name = EXCLUDED.name,
          -- A re-armed sign-up starts over: its confirmation link is valid
          -- for NEWSLETTER_CONFIRM_DAYS from now, and the cron's purge of
          -- unconfirmed sign-ups counts from here too.
          created_at = EXCLUDED.created_at,
          unsubscribed_at = NULL
      WHERE newsletter_subscribers.status <> 'active'
    RETURNING id
  `;

  // Already confirmed: the same answer as any other address, and no mail.
  if (armed.length === 0) {
    return res.status(200).json({ success: true });
  }

  if (isEmailConfigured()) {
    const { subject, text } = confirmationEmail({ language: lang, confirmToken });
    waitUntil(
      sendPublicMail(sql, 'newsletter-confirmation', () => sendEmail({ to: sanitizedEmail, subject, text }))
        .catch((emailError) => {
          reportProviderError('Failed to send newsletter confirmation', emailError);
        })
    );
  }

  return res.status(200).json({ success: true });
}

// POST /api/contact?action=newsletter-confirm  { token }
async function handleNewsletterConfirm(req, res) {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!TOKEN_RE.test(token)) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const sql = getDb();
  const ipLimit = await checkRateLimit(sql, {
    key: rateLimitKey(req, 'newsletter-token-ip', ''),
    limit: 30,
    windowSeconds: CONTACT_WINDOW_SECONDS,
  });
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
  }

  // A confirmation link works for NEWSLETTER_CONFIRM_DAYS after it was sent;
  // an old mail must not opt someone in months later. Opening it again after
  // confirming is answered as a success: the address is subscribed, which is
  // what the parent wants to see (the token is cleared only on unsubscribe).
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const sentAfter = new Date(nowMs - NEWSLETTER_CONFIRM_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const confirmed = await sql`
    UPDATE newsletter_subscribers
    SET status = 'active', confirmed_at = COALESCE(confirmed_at, ${now})
    WHERE confirm_token = ${token}
      AND (status = 'active' OR (status = 'pending' AND created_at >= ${sentAfter}))
    RETURNING id
  `;

  if (confirmed.length === 0) {
    return res.status(400).json({ error: 'Invalid or expired confirmation link' });
  }

  return res.status(200).json({ success: true });
}

// POST /api/contact?action=newsletter-unsubscribe  { token }
async function handleNewsletterUnsubscribe(req, res) {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!TOKEN_RE.test(token)) {
    return res.status(400).json({ error: 'Invalid token' });
  }

  const sql = getDb();
  const ipLimit = await checkRateLimit(sql, {
    key: rateLimitKey(req, 'newsletter-token-ip', ''),
    limit: 30,
    windowSeconds: CONTACT_WINDOW_SECONDS,
  });
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(ipLimit.retryAfter));
    return res.status(429).json({ error: 'Too many requests. Try again later.', code: 'RATE_LIMITED' });
  }

  const now = new Date().toISOString();
  await sql`
    UPDATE newsletter_subscribers
    SET status = 'unsubscribed', unsubscribed_at = ${now}, confirm_token = NULL
    WHERE unsubscribe_token = ${token}
  `;

  // Idempotent + non-enumerable: always report success.
  return res.status(200).json({ success: true });
}
