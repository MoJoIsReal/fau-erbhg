import nodemailer from 'nodemailer';

let cachedTransporter = null;
let cachedPooledTransporter = null;

function gmailAuth() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Email configuration not available');
  }
  return { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD };
}

/**
 * Build (and cache) a nodemailer transporter using the Gmail credentials
 * from env. Throws if credentials are missing.
 *
 * Unpooled on purpose: a request handler sends at most one or two messages and
 * is then frozen by the platform, which would strand an open pooled socket.
 * Batch senders should use createPooledTransporter() instead.
 */
export function createTransporter() {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: gmailAuth(),
  });

  return cachedTransporter;
}

/**
 * Pooled transporter for the cron, which sends a whole batch inside a single
 * invocation and then exits.
 *
 * Without `pool`, nodemailer opens a fresh TCP + TLS + AUTH handshake for every
 * single message — roughly 300 ms at best and commonly 600 ms–1.5 s. At five
 * workers inside a 30 s function that caps a run at roughly 90–250 messages,
 * which is below the configured batch size, so runs were being killed mid-batch
 * with rows left claimed. Pooling amortises the handshake across up to
 * `maxMessages` messages per connection.
 *
 * Call closePooledTransporter() when the batch is done so the sockets are not
 * left open into a frozen instance.
 */
export function createPooledTransporter() {
  if (cachedPooledTransporter) return cachedPooledTransporter;

  cachedPooledTransporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: gmailAuth(),
  });

  return cachedPooledTransporter;
}

/** Send through the pooled transporter. Same message shape as sendEmail(). */
export async function sendPooledEmail({ to, subject, text, from, messageId }) {
  const transporter = createPooledTransporter();
  await transporter.sendMail({
    from: from || process.env.GMAIL_USER,
    to,
    subject,
    text,
    ...(messageId ? { messageId } : {}),
  });
}

/** Release pooled connections. Safe to call when no pool was ever created. */
export function closePooledTransporter() {
  if (!cachedPooledTransporter) return;
  cachedPooledTransporter.close();
  cachedPooledTransporter = null;
}

/**
 * Send a plain-text email through the shared Gmail transporter.
 * `from` defaults to GMAIL_USER. The transporter is cached across invocations
 * within a single warm Vercel function instance.
 */
export async function sendEmail({ to, subject, text, from, messageId }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: from || process.env.GMAIL_USER,
    to,
    subject,
    text,
    ...(messageId ? { messageId } : {}),
  });
}

/**
 * True if Gmail credentials are available. Use this to skip outbound mail
 * silently in environments where email isn't configured (local dev, etc.).
 */
export function isEmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}
