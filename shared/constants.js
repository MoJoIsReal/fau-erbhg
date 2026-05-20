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

// Event types accepted by the events API. Keep in sync with the values
// validated in api/events.js and the icon/color switch in events.tsx.
export const EVENT_TYPES = [
  'meeting',
  'event',
  'activity',
  'dugnad',
  'foto',
  'internal',
  'annet',
  'other',
];
