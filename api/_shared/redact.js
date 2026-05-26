/**
 * Scrub emails and phone numbers from a string before it is logged or sent to
 * an error tracker. Shared by middleware.js and sentry.js so the redaction
 * rules stay in one place.
 */
export function redactSensitiveText(value) {
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, '[redacted-phone]');
}
