/**
 * Scrub emails and phone numbers from a string before it is logged or sent to
 * an error tracker. Shared by middleware.js and sentry.js so the redaction
 * rules stay in one place.
 *
 * The phone rule is a run of digits with separators, which a date is too: it
 * used to turn `2026-11-02T07:00:00.000Z` into `[redacted-phone]T07:00…` and
 * a 13-digit timestamp or id into `[redacted-phone]`, so the clue in a
 * database or provider error was gone. ISO dates are set aside before the
 * phone rule runs, and an unbroken run of 13 or more digits (longer than any
 * phone number written without spaces) is kept. Anything else that looks
 * like a number is still redacted: a wrong guess costs a clue, a missed
 * phone number leaks one.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?(?![\d-])/g;
const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const LONG_ID = /^\d{13,}$/;

export function redactSensitiveText(value) {
  const dates = [];
  const masked = String(value ?? '')
    .replace(EMAIL, '[redacted-email]')
    .replace(ISO_DATE, (date) => `\u0000${dates.push(date) - 1}\u0000`)
    .replace(PHONE, (run) => (LONG_ID.test(run) ? run : '[redacted-phone]'));
  return masked.replace(/\u0000(\d+)\u0000/g, (_, index) => dates[Number(index)]);
}
