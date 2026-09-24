export const FAU_EMAIL: string;
export const PHONE_PLACEHOLDER: string;
export const KINDERGARTEN_ADDRESS: string;
export const KINDERGARTEN_ADDRESS_NORWAY: string;

export const ROLES: {
  readonly admin: 'admin';
  readonly member: 'member';
  readonly staff: 'staff';
};
export type Role = typeof ROLES[keyof typeof ROLES];

export const COUNCIL_ROLES: Role[];
export const YEARLY_CALENDAR_EDITORS: Role[];
export const ADMIN_ONLY: Role[];

export const EVENT_TYPES: readonly [
  'meeting',
  'event',
  'activity',
  'family',
  'dugnad',
  'foto',
  'internal',
  'info',
  'annet',
  'other',
];
export type EventType = typeof EVENT_TYPES[number];

export const MAX_EVENT_ATTENDEES: number;
export const MAX_ATTENDEES_PER_REGISTRATION: number;
