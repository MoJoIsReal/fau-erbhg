import nodemailer from 'nodemailer';

let cachedTransporter = null;

/**
 * Build (and cache) a nodemailer transporter using the Gmail credentials
 * from env. Throws if credentials are missing.
 */
export function createTransporter() {
  if (cachedTransporter) return cachedTransporter;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('Email configuration not available');
  }

  cachedTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  return cachedTransporter;
}

/**
 * Send a plain-text email through the shared Gmail transporter.
 * `from` defaults to GMAIL_USER. The transporter is cached across invocations
 * within a single warm Vercel function instance.
 */
export async function sendEmail({ to, subject, text, from }) {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: from || process.env.GMAIL_USER,
    to,
    subject,
    text,
  });
}

/**
 * True if Gmail credentials are available. Use this to skip outbound mail
 * silently in environments where email isn't configured (local dev, etc.).
 */
export function isEmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}
