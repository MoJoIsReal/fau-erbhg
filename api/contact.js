import { getDb } from './_shared/database.js';
import {
  applySecurityHeaders,
  handleCorsPreFlight,
  handleError,
  sanitizeText,
  sanitizeEmail,
  sanitizePhone,
} from './_shared/middleware.js';
import { checkRateLimit, rateLimitKey } from './_shared/rate-limit.js';
import { sendEmail, isEmailConfigured } from './_shared/email.js';
import { confirmationEmail, newsletterToken } from './_shared/newsletter.js';
import Sentry from './_shared/sentry.js';

const CONTACT_WINDOW_SECONDS = 10 * 60;
const CONTACT_MAX_ATTEMPTS = 3;
const TOKEN_RE = /^[a-f0-9]{64}$/;

export default async function handler(req, res) {
  // Apply security headers and handle CORS
  applySecurityHeaders(res, req.headers.origin);
  if (handleCorsPreFlight(req, res)) return;

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

  try {
    const { name, email, phone, subject, message, website } = req.body;

    // Honeypot: humans never see/fill this field.
    if (website) {
      return res.status(204).end();
    }

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
    const contactIdentifier = isAnonymous ? 'anonymous' : sanitizedEmail;
    const [rateLimit, ipRateLimit] = await Promise.all([
      checkRateLimit(sql, {
        key: rateLimitKey(req, 'contact', contactIdentifier),
        limit: CONTACT_MAX_ATTEMPTS,
        windowSeconds: CONTACT_WINDOW_SECONDS
      }),
      checkRateLimit(sql, {
        key: rateLimitKey(req, 'contact-ip', ''),
        limit: CONTACT_MAX_ATTEMPTS,
        windowSeconds: CONTACT_WINDOW_SECONDS
      })
    ]);

    if (!rateLimit.allowed || !ipRateLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(rateLimit.retryAfter, ipRateLimit.retryAfter)));
      return res.status(429).json({ error: 'Too many messages. Try again later.' });
    }

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

// POST /api/contact?action=newsletter-subscribe
// Double opt-in: store the address as "pending" and email a confirmation link.
// Always answers with a generic success so the endpoint can't be used to probe
// which addresses are already subscribed.
async function handleNewsletterSubscribe(req, res) {
  try {
    const { email, name, language, website } = req.body || {};

    // Honeypot: humans never see/fill this field.
    if (website) {
      return res.status(204).end();
    }

    const sanitizedEmail = sanitizeEmail(email);
    if (!sanitizedEmail) {
      return res.status(400).json({ error: 'Valid email is required' });
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
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const now = new Date().toISOString();
    const existing = await sql`
      SELECT id, status FROM newsletter_subscribers WHERE email = ${sanitizedEmail} LIMIT 1
    `;

    // Already confirmed — nothing to do, and we don't resend anything.
    if (existing.length > 0 && existing[0].status === 'active') {
      return res.status(200).json({ success: true });
    }

    const confirmToken = newsletterToken();
    if (existing.length > 0) {
      // Re-arm a pending or previously unsubscribed address with a fresh token.
      await sql`
        UPDATE newsletter_subscribers
        SET status = 'pending',
            confirm_token = ${confirmToken},
            language = ${lang},
            name = ${sanitizedName},
            unsubscribed_at = NULL
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO newsletter_subscribers (email, name, language, status, confirm_token, unsubscribe_token, created_at)
        VALUES (${sanitizedEmail}, ${sanitizedName}, ${lang}, 'pending', ${confirmToken}, ${newsletterToken()}, ${now})
      `;
    }

    if (isEmailConfigured()) {
      try {
        const { subject, text } = confirmationEmail({ language: lang, confirmToken });
        await sendEmail({ to: sanitizedEmail, subject, text });
      } catch (emailError) {
        console.error('Failed to send newsletter confirmation:', emailError.message);
        if (process.env.NODE_ENV === 'production') {
          Sentry.captureException(emailError);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/contact?action=newsletter-confirm  { token }
async function handleNewsletterConfirm(req, res) {
  try {
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
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const now = new Date().toISOString();
    const confirmed = await sql`
      UPDATE newsletter_subscribers
      SET status = 'active', confirmed_at = ${now}, confirm_token = NULL
      WHERE confirm_token = ${token} AND status = 'pending'
      RETURNING id
    `;

    if (confirmed.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired confirmation link' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
}

// POST /api/contact?action=newsletter-unsubscribe  { token }
async function handleNewsletterUnsubscribe(req, res) {
  try {
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
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }

    const now = new Date().toISOString();
    await sql`
      UPDATE newsletter_subscribers
      SET status = 'unsubscribed', unsubscribed_at = ${now}, confirm_token = NULL
      WHERE unsubscribe_token = ${token}
    `;

    // Idempotent + non-enumerable: always report success.
    return res.status(200).json({ success: true });
  } catch (error) {
    return handleError(res, error);
  }
}
