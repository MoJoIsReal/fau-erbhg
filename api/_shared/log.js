/**
 * Structured request logging.
 *
 * Every log line used to be `console.error('API Error:', {name, message, stack,
 * code})` and nothing else. That is unusable on this codebase in particular,
 * because four handlers multiplex many resources behind one serverless
 * function: a 500 from `secure-settings.js` did not say whether the caller was
 * asking for `resource=users` or `resource=blog-posts`, and nothing tied the
 * line to the request the user was complaining about. Successful mutations were
 * not logged at all, so there was no audit trail either.
 *
 * One JSON object per line, so a log drain can filter on the fields rather than
 * on substrings. Everything that can carry user input goes through
 * `redactSensitiveText` and is length-capped first — a log line is never worth
 * leaking an address into.
 */

import { redactSensitiveText } from './redact.js';

const LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const MAX_FIELD_LENGTH = 200;

// Symbol-keyed so it cannot collide with anything the platform puts on `req`.
export const ACTOR_KEY = Symbol.for('fau.request.actor');

/**
 * Vercel stamps `x-vercel-id` on every inbound request and it is the id that
 * appears in the platform's own logs, so reusing it keeps our lines joinable
 * with theirs instead of introducing a second, unrelated id.
 * @param {Object} req
 * @returns {string|null}
 */
export function getRequestId(req) {
  const header = req?.headers?.['x-vercel-id'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.trim().slice(0, MAX_FIELD_LENGTH);
  }
  return null;
}

/**
 * The path without its query string. The query string is where emails, tokens
 * and unsubscribe secrets live on this API, so it never reaches a log line;
 * the fields that matter for routing (`action`, `resource`) are logged
 * explicitly instead.
 * @param {Object} req
 * @returns {string|null}
 */
export function getRequestPath(req) {
  const url = req?.url;
  if (typeof url !== 'string' || url.length === 0) return null;
  const [path] = url.split('?');
  return path.slice(0, MAX_FIELD_LENGTH);
}

function scrub(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  const text = redactSensitiveText(value);
  return text.length > MAX_FIELD_LENGTH ? text.slice(0, MAX_FIELD_LENGTH) : text;
}

/**
 * Write one structured line. Returns the object that was written so tests (and
 * callers that want to attach the same fields to something else) can assert on
 * it without parsing stdout.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} event - dot-separated event name, e.g. 'api.error'
 * @param {Object} [fields]
 * @returns {Object}
 */
export function logEvent(level, event, fields = {}) {
  const safeLevel = LEVELS.has(level) ? level : 'info';
  const line = { level: safeLevel, event: String(event) };

  for (const [key, value] of Object.entries(fields)) {
    const scrubbed = scrub(value);
    if (scrubbed !== undefined) line[key] = scrubbed;
  }

  const text = JSON.stringify(line);
  if (safeLevel === 'error' || safeLevel === 'warn') {
    console.error(text);
  } else {
    console.log(text);
  }
  return line;
}

/**
 * The request-scoped fields shared by every line about one request. `actor` is
 * stashed on the request by `requireAuth`, so an unauthenticated request simply
 * logs without one rather than forcing every call site to pass a user through.
 * @param {Object} req
 * @returns {Object}
 */
export function requestFields(req) {
  const actor = req?.[ACTOR_KEY];
  return {
    requestId: getRequestId(req),
    method: req?.method,
    path: getRequestPath(req),
    action: req?.query?.action,
    resource: req?.query?.resource,
    userId: actor?.userId,
    role: actor?.role,
  };
}

/**
 * Record who the request turned out to be, once authentication has resolved it.
 * Only the id and the role are kept: the name, username and email are not
 * things a log line needs.
 * @param {Object} req
 * @param {Object|null} user
 */
export function setRequestActor(req, user) {
  if (!req || !user) return;
  req[ACTOR_KEY] = { userId: user.userId, role: user.role };
}
