import nodemailer from 'nodemailer';
import net from 'node:net';

let cachedTransporter = null;
let cachedPooledTransporter = null;
const pooledSockets = new Set();
const SMTP_TIMEOUTS = { connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 5000 };

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
    ...SMTP_TIMEOUTS,
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
export function createPooledTransporter(deadline = Date.now() + 23_000) {
  if (cachedPooledTransporter) return cachedPooledTransporter;

  cachedPooledTransporter = nodemailer.createTransport({
    service: 'gmail',
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: gmailAuth(),
    ...SMTP_TIMEOUTS,
    // Public Nodemailer socket hook: retain ownership of the TCP connection
    // so the absolute deadline can abort even an active TLS/SMTP send. Pool
    // close() alone waits for busy resources. secured:false preserves the
    // Gmail transport's mandatory TLS upgrade and certificate verification.
    getSocket(options, callback) {
      if (Date.now() >= deadline) return callback(new Error('SMTP deadline exceeded'));
      const socket = net.connect({ host: options.host, port: Number(options.port) });
      pooledSockets.add(socket);
      let handedOff = false;
      const finish = (error, value) => {
        if (handedOff) return;
        handedOff = true;
        callback(error, value);
      };
      const deadlineTimer = setTimeout(() => socket.destroy(), Math.max(1, deadline - Date.now()));
      const connectTimer = setTimeout(() => socket.destroy(), SMTP_TIMEOUTS.connectionTimeout);
      socket.once('connect', () => {
        clearTimeout(connectTimer);
        finish(null, { connection: socket, secured: false });
      });
      socket.on('error', error => finish(error));
      socket.once('close', () => {
        clearTimeout(deadlineTimer);
        clearTimeout(connectTimer);
        pooledSockets.delete(socket);
        finish(new Error('SMTP connection closed before ready'));
      });
    },
  });

  return cachedPooledTransporter;
}

/** Send through the pooled transporter. Same message shape as sendEmail(). */
export async function sendPooledEmail({ to, subject, text, from, messageId }, { deadline = Date.now() + 23_000 } = {}) {
  const transporter = createPooledTransporter(deadline);
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
  for (const socket of pooledSockets) socket.destroy();
  pooledSockets.clear();
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
