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
export const MEDIA_SHARE_ROLES: Role[];

export const EVENT_TYPES: readonly [
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
export type EventType = typeof EVENT_TYPES[number];

export const MAX_EVENT_ATTENDEES: number;
export const MAX_ATTENDEES_PER_REGISTRATION: number;

export const SIGNUP_ERROR_CODES: readonly [
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
];
export type SignupErrorCode = typeof SIGNUP_ERROR_CODES[number];

export const API_ERROR_CODES: readonly [
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
];
export type ApiErrorCode = typeof API_ERROR_CODES[number];
