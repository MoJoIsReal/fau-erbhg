/**
 * Shared constants across the application.
 * Plain JS so both Vercel serverless functions (api/*.js) and the
 * Vite-bundled client can import them. Types live in constants.d.ts.
 */

export const FAU_EMAIL = 'fauerdalbarnehage@gmail.com';
export const PHONE_PLACEHOLDER = '+47 xxx xx xxx';

export const KINDERGARTEN_ADDRESS = 'Steinråsa 5, 5306 Erdal';
export const KINDERGARTEN_ADDRESS_NORWAY = 'Steinråsa 5, 5306 Erdal, Norway';

// User roles. Keep in sync with the `role` column on the `users` table.
export const ROLES = {
  admin: 'admin',
  member: 'member',
  staff: 'staff',
};

// Role groupings used by authorization checks. Centralized so adding or
// removing a permission only touches one place.
export const COUNCIL_ROLES = [ROLES.admin, ROLES.member];
export const YEARLY_CALENDAR_EDITORS = [ROLES.admin, ROLES.member, ROLES.staff];
export const ADMIN_ONLY = [ROLES.admin];
// Who may create, extend and revoke private media shares (docs/mediedeling.md).
// The shares show children, so this is deliberately narrower than the council.
export const MEDIA_SHARE_ROLES = [ROLES.admin];

// Event types accepted by the events API. Keep in sync with the values
// validated in api/events.js and the icon/color switch in events.tsx.
export const EVENT_TYPES = [
  'meeting',
  'event',
  'activity',
  'family',
  'dugnad',
  'foto',
  'foreldrefest',
  'internal',
  'info',
  'annet',
  'other',
];

// Document categories the upload API accepts: the three archive sections of
// the documents page, and images uploaded from inside the rich-text editor
// (stored as documents, never listed).
export const DOCUMENT_CATEGORIES = Object.freeze(['protokoll', 'vedtekter', 'budsjett', 'editor-image']);

// Largest capacity an event can be given. The events API refuses anything
// above it rather than saving it as unlimited, and the event form checks the
// same limit so the council sees the reason before submitting.
export const MAX_EVENT_ATTENDEES = 1000;

// Most people one public signup may register. The signup form offers fewer;
// the API enforces this so a scripted request cannot take a whole event (or a
// whole photo day) in one go.
export const MAX_ATTENDEES_PER_REGISTRATION = 10;

// Why a public event signup was refused. api/registrations.js answers with one
// of these as `code` and the signup form shows its translation; the `error`
// text beside it is only a fallback for other callers. The form used to match
// substrings of the English messages, and showed anything it did not
// recognise untranslated.
export const SIGNUP_ERROR_CODES = Object.freeze([
  'INVALID_SIGNUP',
  'ATTENDEES_OUT_OF_RANGE',
  'EMAIL_REJECTED',
  'EMAIL_TYPO',
  'RATE_LIMITED',
  'EVENT_INACTIVE',
  'SIGNUP_CLOSED',
  'DEADLINE_PASSED',
  'CHILD_NAMES_REQUIRED',
  'ATTENDEE_NAMES_REQUIRED',
  'PHOTO_SLOTS_FULL',
  'PHOTO_SLOT_TAKEN',
  'FOOD_CONTRIBUTION_REQUIRED',
  'EVENT_FULL',
  'ALREADY_REGISTERED',
]);

// Why the API refused a request, for everything but a public signup (which has
// SIGNUP_ERROR_CODES). Handlers answer a refusal a user can actually run into
// with one of these as `code`, and the client shows its translation
// (apiErrorText in client/src/lib/queryClient.ts) — never the `error` text,
// which is English (or once, Norwegian only) and meant for logs and scripts.
export const API_ERROR_CODES = Object.freeze([
  'RATE_LIMITED',
  'REQUIRED_FIELDS',
  'NOT_FOUND',
  'INVALID_CREDENTIALS',
  'CURRENT_PASSWORD_INCORRECT',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_UNCHANGED',
  'FIELD_TOO_LARGE',
  'INVALID_EMAIL',
  'NAME_AND_EMAIL_REQUIRED',
  'MESSAGE_REQUIRED',
  'EVENT_FIELDS_REQUIRED',
  'INVALID_EVENT_DATE',
  'INVALID_EVENT_TIME',
  'INVALID_MAX_ATTENDEES',
  'INVALID_REGISTRATION_DEADLINE',
  'INVALID_EVENT_TYPE',
  'TITLE_REQUIRED',
  'UPLOAD_TYPE_NOT_ALLOWED',
  'UPLOAD_TOO_LARGE',
  'UPLOAD_NOT_VERIFIED',
  'USERNAME_TAKEN',
  'EMAIL_NOT_CONFIGURED',
  'REPLY_REQUIRED',
  'NO_REPLY_ADDRESS',
  'REPLY_SEND_FAILED',
  'ENTRY_FIELDS_REQUIRED',
  'TEMP_PASSWORD_EXPIRED',
]);
