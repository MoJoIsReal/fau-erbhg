import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeHtml } from '../api/_shared/middleware.js';
import { rateLimitKey } from '../api/_shared/rate-limit.js';
import {
  PASSWORD_EXPIRY_DAYS,
  generateTemporaryPassword,
  isPasswordChangeRequired,
  isUndefinedColumnError,
} from '../api/_shared/password-policy.js';
import { assignPhotoSlots, resolvePhotoSlotsForRegistration } from '../shared/photo-slots.js';
import { YOUTUBE_EMBED_HOST } from '../shared/video-embed.js';
import { COUNCIL_ROLES, EVENT_TYPES, ROLES } from '../shared/constants.js';
import {
  VALID_YEARLY_CALENDAR_COLORS,
  VALID_YEARLY_CALENDAR_ENTRY_TYPES,
  buildImportPreview,
  diffYearlyCalendarEntry,
  getKindergartenSchoolYear,
  isMonthInSchoolYear,
  normalizeYearlyCalendarTitle,
  supportsYearlyCalendarNewsletter,
  validateImportDecision,
  validateYearlyCalendarImportRow,
} from '../shared/yearly-calendar-utils.js';
import {
  getYearlyCalendarMonthGroups,
  getYearlyCalendarTodayMarker,
} from '../shared/yearly-calendar-display.js';
import { parseCloudinaryDeliveryUrl } from '../api/_shared/cloudinary-url.js';
import {
  contactAcknowledgementEmail,
  contactReplyEmail,
  contactSubjectLabel,
} from '../api/_shared/contact-emails.js';

const YEAR_COLUMN = '\u00e5r';
const MONTH_COLUMN = 'm\u00e5ned';
const HOMEPAGE_COLUMN = 'vis_p\u00e5_forside';

// Models what actually reaches a Vercel function: the platform sets x-real-ip
// itself and overwrites any incoming copy, while everything to the left of the
// last x-forwarded-for hop is whatever the caller chose to send.
function mockReq(ip = '203.0.113.10', spoofedPrefix = null) {
  return {
    headers: {
      'x-real-ip': ip,
      'x-forwarded-for': spoofedPrefix ? `${spoofedPrefix}, ${ip}` : ip,
    },
  };
}

function testSanitizeHtml() {
  const payloads = [
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '<a href="javascript:alert(1)">bad</a>',
    '<a href="java&#x73;cript:alert(1)">encoded</a>',
    '<iframe src="https://example.com"></iframe>',
  ];

  for (const payload of payloads) {
    const sanitized = sanitizeHtml(payload);
    assert.equal(/onerror|onload|javascript:|<svg|<iframe/i.test(sanitized), false, payload);
  }

  assert.equal(
    sanitizeHtml('<a href="https://example.com">ok</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>',
  );
}

// A video embed only reaches the visitor if two files agree: the sanitizer has
// to keep the frame, and the CSP has to allow its origin. They live far apart,
// and a frame-src the sanitizer's host is missing from fails silently — the
// browser just renders an empty box — so check them against each other here.
function testVideoEmbedCsp() {
  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const cspHeader = vercelConfig.headers
    ?.flatMap((entry) => entry.headers ?? [])
    .find((header) => header.key === 'Content-Security-Policy');

  assert.ok(cspHeader, 'vercel.json should still set a Content-Security-Policy');

  // Split the policy into directives and compare sources literally. Building a
  // regex out of the host would leave its dots unescaped, so the guard would
  // also accept a neighbouring host that merely looks like ours.
  const frameSrc = cspHeader.value
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive === 'frame-src' || directive.startsWith('frame-src '));

  assert.ok(frameSrc, 'CSP must declare a frame-src directive for video embeds');
  assert.ok(
    frameSrc.split(/\s+/).slice(1).includes(`https://${YOUTUBE_EMBED_HOST}`),
    `CSP must allow ${YOUTUBE_EMBED_HOST}, the only host the sanitizer lets through as an iframe`,
  );

  const kept = sanitizeHtml(`<iframe src="https://${YOUTUBE_EMBED_HOST}/embed/IgVwQOoZm2I"></iframe>`);
  assert.match(kept, /^<iframe /, 'the sanitizer should keep a YouTube no-cookie embed');

  const safeHtml = readFileSync(new URL('../client/src/components/safe-html.tsx', import.meta.url), 'utf8');
  assert.match(
    safeHtml,
    /youtubeEmbedSrc/,
    'SafeHtml must validate frame sources with the same shared helper as the server',
  );
}

function testRateLimitKeys() {
  const keyA = rateLimitKey(mockReq('203.0.113.10'), 'login', 'Admin@Example.com');
  const keyB = rateLimitKey(mockReq('203.0.113.10'), 'login', 'admin@example.com');
  const keyC = rateLimitKey(mockReq('203.0.113.11'), 'login', 'admin@example.com');

  assert.equal(keyA, keyB);
  assert.notEqual(keyA, keyC);
  assert.match(keyA, /^[a-f0-9]{64}$/);

  // Every per-IP limit on this API was bypassable by prepending a fresh entry
  // to X-Forwarded-For. A caller-chosen left-most hop must not move the key.
  const spoofed = rateLimitKey(
    mockReq('203.0.113.10', '198.51.100.7'),
    'login',
    'admin@example.com',
  );
  assert.equal(spoofed, keyA, 'a spoofed left-most X-Forwarded-For must not change the key');

  const rotated = rateLimitKey(
    mockReq('203.0.113.10', '198.51.100.8'),
    'login',
    'admin@example.com',
  );
  assert.equal(rotated, keyA, 'rotating the spoofed entry must not produce a new bucket');

  // No x-real-ip (local dev, or a request that never passed the edge): the
  // right-most hop is the one our own proxy appended, never the client's.
  const proxiedOnly = rateLimitKey(
    { headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.10' } },
    'login',
    'admin@example.com',
  );
  assert.equal(proxiedOnly, keyA, 'without x-real-ip the right-most hop is the trusted one');
}

function testCloudinaryDeliveryUrlParsing() {
  const imageDelivery = parseCloudinaryDeliveryUrl(
    new URL('https://res.cloudinary.com/fau-demo/image/upload/v1770000000/fau-documents/1770000000000-tips.jpg'),
  );

  assert.deepEqual(imageDelivery, {
    cloudName: 'fau-demo',
    resourceType: 'image',
    deliveryType: 'upload',
    publicId: 'fau-documents/1770000000000-tips',
  });

  const rawDelivery = parseCloudinaryDeliveryUrl(
    new URL('https://res.cloudinary.com/fau-demo/raw/upload/v1770000000/fau-documents/1770000000000-referat.pdf'),
  );

  assert.deepEqual(rawDelivery, {
    cloudName: 'fau-demo',
    resourceType: 'raw',
    deliveryType: 'upload',
    publicId: 'fau-documents/1770000000000-referat.pdf',
  });
}

function testAssignPhotoSlots() {
  const event = { time: '10:00' };

  // Empty event: first booking gets sequential 5-min slots starting at event time.
  assert.deepEqual(
    assignPhotoSlots(event, [], 3),
    ['10:00', '10:05', '10:10'],
  );

  // Existing booking blocks its grid cells; next booking lands after the gap.
  const existing = [
    { id: 1, attendeeCount: 2, childrenNames: '["A","B"]', photoSlots: '["10:00","10:05"]' },
  ];
  assert.deepEqual(
    assignPhotoSlots(event, existing, 2),
    ['10:10', '10:15'],
  );

  // Legacy registration (no stored slots, has childrenNames) blocks 10 min/child.
  const legacy = [
    { id: 1, attendeeCount: 1, childrenNames: '["A"]', photoSlots: null },
  ];
  assert.deepEqual(
    assignPhotoSlots(event, legacy, 1),
    ['10:10'],
  );
}

function testResolvePhotoSlotsForRegistration() {
  const event = { time: '10:00' };

  // Registration with stored slots: returned directly, without replaying the
  // legacy sequence (the rest of allRegistrations is irrelevant here).
  const withStored = { id: 5, photoSlots: '["10:15","10:20"]', childrenNames: '["A","B"]' };
  assert.deepEqual(
    resolvePhotoSlotsForRegistration(event, withStored, [withStored]),
    ['10:15', '10:20'],
  );

  // Legacy registrations (no stored slots): replay the 10-min/child sequential
  // assignment in registration-id order among the other legacy rows for the event.
  const legacyA = { id: 1, attendeeCount: 1, childrenNames: '["A"]', photoSlots: null };
  const legacyB = { id: 2, attendeeCount: 2, childrenNames: '["B","C"]', photoSlots: null };
  const all = [legacyA, legacyB];
  assert.deepEqual(resolvePhotoSlotsForRegistration(event, legacyA, all), ['10:00']);
  assert.deepEqual(resolvePhotoSlotsForRegistration(event, legacyB, all), ['10:10', '10:20']);

  // A registration with no children (excluded from the legacy set entirely)
  // never matches, so it resolves to no slots.
  const noChildren = { id: 3, attendeeCount: 1, childrenNames: null, photoSlots: null };
  assert.deepEqual(
    resolvePhotoSlotsForRegistration(event, noChildren, [legacyA, legacyB, noChildren]),
    [],
  );
}

function testSharedConstants() {
  assert.equal(ROLES.admin, 'admin');
  assert.equal(ROLES.member, 'member');
  assert.equal(ROLES.staff, 'staff');
  assert.deepEqual(COUNCIL_ROLES, ['admin', 'member']);
  assert.ok(EVENT_TYPES.includes('meeting'));
  assert.ok(EVENT_TYPES.includes('foto'));
  assert.ok(!EVENT_TYPES.includes('not-a-real-type'));
}

function testPasswordPolicy() {
  const password = generateTemporaryPassword();
  assert.equal(password.length, 16);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[0-9]/);

  const now = new Date('2026-07-01T12:00:00Z');
  assert.equal(PASSWORD_EXPIRY_DAYS, 365);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: true, passwordChangedAt: now.toISOString() }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: null }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: '2025-06-30T11:59:59Z' }, now), true);
  assert.equal(isPasswordChangeRequired({ mustChangePassword: false, passwordChangedAt: '2025-07-02T12:00:00Z' }, now), false);
  assert.equal(isUndefinedColumnError({ code: '42703' }), true);
  assert.equal(isUndefinedColumnError({ message: 'column "must_change_password" does not exist' }), true);
  assert.equal(isUndefinedColumnError({ code: '23505' }), false);
}

function testClientRegressionGuards() {
  const queryClient = readFileSync(new URL('../client/src/lib/queryClient.ts', import.meta.url), 'utf8');
  assert.match(
    queryClient,
    /export class ApiError extends Error/,
    'API requests should throw a structured ApiError with status and body',
  );
  assert.match(
    queryClient,
    /export function getApiErrorBody/,
    'UI code should have a typed helper for reading structured API error bodies',
  );
  assert.match(
    queryClient,
    /JSON\.parse/,
    'API error handling should parse JSON response bodies instead of throwing raw text only',
  );

  // Event editing moved off the events page and into the calendar's editor
  // tools; these rules moved with it.
  const editorTools = readFileSync(
    new URL('../client/src/components/calendar-editor-tools.tsx', import.meta.url),
    'utf8',
  );
  const cancelMutationBlock = editorTools.slice(
    editorTools.indexOf('const cancelMutation'),
    editorTools.indexOf('const deleteMutation'),
  );
  assert.match(
    cancelMutationBlock,
    /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/events"\]\s*\}\)/s,
    'Cancelling an event must invalidate the public events query the calendar reads',
  );
  assert.equal(
    cancelMutationBlock.includes('queryKey: ["/api/secure/events"]'),
    false,
    'Cancelling an event must not invalidate the unused /api/secure/events key',
  );
  assert.match(
    editorTools,
    /getApiErrorBody\(error\)/,
    'Event delete errors should read structured API error bodies',
  );
  assert.match(
    editorTools,
    /hasRegistrations/,
    'Deleting an event with registrations must explain the refusal, not show a generic error',
  );

  const contentPage = readFileSync(new URL('../client/src/pages/content.tsx', import.meta.url), 'utf8');
  assert.match(
    contentPage,
    /const \[postDraft, setPostDraft\]/,
    'Content editor should keep edits in a draft so Cancel can discard them',
  );
  assert.match(
    contentPage,
    /const startEditingPost = \(index: number\)/,
    'Content editor should start editing from a copied draft',
  );
  assert.match(
    contentPage,
    /const cancelEditingPost = \(\)/,
    'Content editor should have an explicit cancel path that discards drafts',
  );

  const calendarView = readFileSync(new URL('../client/src/components/calendar-view.tsx', import.meta.url), 'utf8');
  assert.match(
    calendarView,
    /aria-label=\{t\.\w+\.previousMonth\}/,
    'Calendar previous-month icon button must have an accessible name',
  );
  assert.match(
    calendarView,
    /aria-label=\{t\.\w+\.nextMonth\}/,
    'Calendar next-month icon button must have an accessible name',
  );

  const filesPage = readFileSync(new URL('../client/src/pages/files.tsx', import.meta.url), 'utf8');
  assert.match(
    filesPage,
    /aria-label=\{`\$\{t\.documents\.download\} \$\{doc\.title\}`\}/,
    'Document download links must name the document they download',
  );
  assert.match(
    filesPage,
    /aria-label=\{language === ['"]no['"] \? `Slett \$\{doc\.title\}` : `Delete \$\{doc\.title\}`\}/,
    'Document delete icon buttons must have accessible names',
  );

  const attendeeTooltip = readFileSync(new URL('../client/src/components/attendee-tooltip.tsx', import.meta.url), 'utf8');
  assert.match(
    attendeeTooltip,
    /queryKey:\s*\[`\/api\/registrations\?eventId=\$\{eventId\}`\]/,
    'Attendee tooltip must fetch the event registration endpoint, not the events list',
  );
  assert.equal(
    attendeeTooltip.includes('queryKey: ["/api/events", eventId, "registrations"]'),
    false,
    'Attendee tooltip must not treat query-key segments as URL path segments',
  );
  assert.match(
    editorTools,
    /<AttendeeTooltip\s+eventId=\{entry\.event\.id\}/,
    'The calendar detail panel must render the corrected attendee tooltip for editors',
  );

  const app = readFileSync(new URL('../client/src/App.tsx', import.meta.url), 'utf8');
  const messagesRoute = app.slice(
    app.indexOf('<Route path="/messages">'),
    app.indexOf('<Route path="/arskalender">'),
  );
  assert.match(
    messagesRoute,
    /<RequireAuth roles=\{\["admin", "member"\]\}>/,
    'Messages route must match the API council-only authorization policy',
  );
  assert.equal(
    messagesRoute.includes('"staff"'),
    false,
    'Kindergarten staff must not pass the messages page route guard',
  );

  const fileUploadModal = readFileSync(new URL('../client/src/components/file-upload-modal.tsx', import.meta.url), 'utf8');
  assert.match(
    fileUploadModal,
    /aria-label=\{`\$\{t\.documents\.removeFile\}: \$\{selectedFile\.name\}`\}/,
    'Selected-file remove button must have a localized accessible name including the filename',
  );

  const richTextEditor = readFileSync(new URL('../client/src/components/RichTextEditor.tsx', import.meta.url), 'utf8');
  assert.match(
    richTextEditor,
    /const toolbarLabels/,
    'Rich text editor toolbar should centralize translated accessible labels',
  );
  assert.match(
    richTextEditor,
    /aria-label=\{toolbarLabels\.bold\}/,
    'Rich text editor bold button must have an accessible name',
  );
  assert.match(
    richTextEditor,
    /aria-pressed=\{editor\.isActive\('bold'\)\}/,
    'Rich text editor active formatting buttons should expose pressed state',
  );

  const yearlyCalendarModal = readFileSync(new URL('../client/src/components/yearly-calendar-entry-modal.tsx', import.meta.url), 'utf8');
  assert.match(
    yearlyCalendarModal,
    /supportsYearlyCalendarNewsletter\(entryType\)/,
    'Yearly calendar modal should show newsletter reminders for every supported dated entry type',
  );
  assert.match(
    yearlyCalendarModal,
    /notifyNewsletter:\s*supportsNewsletter\s*\?\s*notifyNewsletter\s*:\s*false/,
    'Yearly calendar modal should preserve newsletter choice for supported dated entry types',
  );

  const yearlyCalendarExcel = readFileSync(new URL('../client/src/lib/yearly-calendar-excel.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    yearlyCalendarExcel,
    /escapeXmlText/,
    'Yearly calendar Excel export must not reintroduce an escaper that leaves double quotes raw',
  );
  assert.match(
    yearlyCalendarExcel,
    /function escapeXml\(value: string\)[\s\S]*?\.replace\(\/"\/g, "&quot;"\)/,
    'Every value interpolated into the exported worksheet XML sits inside quotes, so the escaper must escape them',
  );
  assert.match(
    yearlyCalendarExcel,
    /values\.filter\(\(value\) => LIST_FORMULA_SAFE\.test\(value\)\)/,
    'Data validation lists must drop values an Excel list formula cannot express',
  );

  const yearlyCalendarApi = readFileSync(new URL('../api/yearly-calendar.js', import.meta.url), 'utf8');
  assert.match(
    yearlyCalendarApi,
    /supportsYearlyCalendarNewsletter\(entryType\)/,
    'Yearly calendar API should accept newsletter flags for every supported dated entry type',
  );

  const eventReminders = readFileSync(new URL('../api/cron/event-reminders.js', import.meta.url), 'utf8');
  assert.match(
    eventReminders,
    /entry_type IN \('day_event', 'closed'\)/,
    'Newsletter cron should include closed yearly calendar entries',
  );

  // "What happens next" is filtered in the shared useUpcomingItems hook, so
  // the rules live in one tested place; the homepage must consume it rather
  // than growing its own copy. (The footer used to render a next-meeting
  // block from the same hook; it no longer does, so every page but the
  // homepage is spared those three queries.)
  const upcomingItemsHook = readFileSync(new URL('../client/src/hooks/useUpcomingItems.ts', import.meta.url), 'utf8');
  assert.match(
    upcomingItemsHook,
    /\/api\/yearly-calendar\?schoolYear=/,
    'Upcoming-items hook should consider yearly calendar entries shown on the homepage',
  );
  assert.match(
    upcomingItemsHook,
    /entry\.entryType === "closed"/,
    'Upcoming-items hook should include closed yearly calendar entries',
  );
  assert.match(
    upcomingItemsHook,
    /daysWithEvent\.has\(dayKey\(entry\.date\)\)/,
    'Upcoming-items hook should drop yearly day events on days a signup event already covers',
  );
  const homePage = readFileSync(new URL('../client/src/pages/home.tsx', import.meta.url), 'utf8');
  assert.match(
    homePage,
    /useUpcomingItems\(\)/,
    'The homepage\'s upcoming list should come from the shared useUpcomingItems hook',
  );
  const layout = readFileSync(new URL('../client/src/components/layout.tsx', import.meta.url), 'utf8');
  assert.match(
    layout,
    /SheetContent[^>]+overflow-y-auto/,
    'Mobile menu sheet content should be scrollable so signed-in actions remain reachable',
  );

  const toastComponent = readFileSync(new URL('../client/src/components/ui/toast.tsx', import.meta.url), 'utf8');
  assert.match(
    toastComponent,
    /pointer-events-none/,
    'Toast viewport should not block mobile header/menu taps outside the toast card',
  );
  assert.match(
    toastComponent,
    /top-20/,
    'Mobile toast viewport should sit below the sticky header instead of covering the menu button',
  );

  const secureSettingsApi = readFileSync(new URL('../api/secure-settings.js', import.meta.url), 'utf8');
  assert.match(
    secureSettingsApi,
    /Det er opprettet en konto for deg på FAU Erdal Barnehage sin nettside\./,
    'New-user email should say the account was created on the FAU Erdal Barnehage website',
  );
  assert.match(
    secureSettingsApi,
    /Nettside: \$\{publicBaseUrl\(\)\}/,
    'New-user email should include a link to the website',
  );

  const contactApi = readFileSync(new URL('../api/contact.js', import.meta.url), 'utf8');
  assert.match(
    contactApi,
    /sendAcknowledgementEmail\(/,
    'Contact form should send an auto-reply receipt to the sender',
  );
  assert.match(
    contactApi,
    /if \(!isAnonymous && sanitizedEmail\) \{/,
    'Auto-reply must be skipped for anonymous submissions, which have no address',
  );

  const loginModal = readFileSync(new URL('../client/src/components/login-modal.tsx', import.meta.url), 'utf8');
  assert.match(
    loginModal,
    /duration:\s*2500/,
    'Successful login toast should auto-dismiss quickly on mobile',
  );

  // zod 4 splits a schema's input and output types wherever a field carries a
  // .default(). zodResolver types the form on the input side and hands the
  // output side to onSubmit, so this form needs all three useForm generics.
  // Collapsing it back to useForm<FormData> is a type error today, but the
  // shape is easy to "simplify" by mistake, and the three .default(false)
  // fields it depends on are what make it necessary.
  const eventCreationModal = readFileSync(new URL('../client/src/components/event-creation-modal.tsx', import.meta.url), 'utf8');
  assert.match(
    eventCreationModal,
    /useForm<FormInput,\s*unknown,\s*FormData>/,
    'Event creation form must keep the input/output useForm generics that zod 4 defaults require',
  );
  assert.match(
    eventCreationModal,
    /type FormInput = z\.input<typeof formSchema>/,
    'FormInput must stay bound to the schema input type, not the output type',
  );
  assert.match(
    eventCreationModal,
    /type FormData = z\.output<typeof formSchema>/,
    'FormData must stay bound to the schema output type that onSubmit receives',
  );
}

function validDayRow(overrides = {}) {
  return {
    entry_type: 'day_event',
    tittel: 'Sommerfest',
    dato: '2028-06-04',
    [YEAR_COLUMN]: 2028,
    [MONTH_COLUMN]: 6,
    beskrivelse: 'Sommerfest for alle',
    farge: 'green',
    [HOMEPAGE_COLUMN]: true,
    for_foreldre: false,
    ...overrides,
  };
}

function validWeekRow(overrides = {}) {
  return {
    entry_type: 'week_event',
    tittel: 'Brannvernuke',
    [YEAR_COLUMN]: 2027,
    [MONTH_COLUMN]: 9,
    uke_fra: 38,
    farge: 'orange',
    ...overrides,
  };
}

function assertInvalidContains(result, expected) {
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((message) => message.includes(expected)),
    `Expected one error to include "${expected}", got ${JSON.stringify(result.errors)}`,
  );
  assert.ok(
    result.errors.every((message) => message.includes('Rad 12:')),
    `Expected all errors to include row number, got ${JSON.stringify(result.errors)}`,
  );
}

function testYearlyCalendarDateHelpers() {
  assert.equal(getKindergartenSchoolYear(new Date('2026-01-15T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-07-31T12:00:00Z')), 2025);
  assert.equal(getKindergartenSchoolYear(new Date('2026-08-01T12:00:00Z')), 2026);
  assert.equal(getKindergartenSchoolYear(new Date('2026-12-31T12:00:00Z')), 2026);
  assert.equal(isMonthInSchoolYear(2027, 8, 2027), true);
  assert.equal(isMonthInSchoolYear(2028, 7, 2027), true);
  assert.equal(isMonthInSchoolYear(2028, 8, 2027), false);
  assert.equal(isMonthInSchoolYear(2027, 7, 2027), false);
}

function testYearlyCalendarMonthGroups() {
  const groups = getYearlyCalendarMonthGroups(2025, new Date('2026-07-01T12:00:00Z'));

  assert.deepEqual(groups.currentAndUpcoming, [{ year: 2026, month: 7 }]);
  assert.deepEqual(groups.past.slice(0, 3), [
    { year: 2026, month: 6 },
    { year: 2026, month: 5 },
    { year: 2026, month: 4 },
  ]);
  assert.deepEqual(groups.past.at(-1), { year: 2025, month: 8 });
}

function testYearlyCalendarTodayMarker() {
  assert.deepEqual(getYearlyCalendarTodayMarker(new Date('2026-07-01T12:00:00Z')), {
    date: '2026-07-01',
    weekNumber: 27,
    monthValue: 2026 * 12 + 7,
  });
}

function testYearlyCalendarTitleNormalization() {
  assert.equal(normalizeYearlyCalendarTitle('  Sommerfest   Juni '), 'sommerfest juni');
  assert.equal(normalizeYearlyCalendarTitle(' BL\u00c5B\u00c6R  og   GR\u00d8T '), 'bl\u00e5b\u00e6r og gr\u00f8t');
  assert.equal(normalizeYearlyCalendarTitle(null), '');
}

function testYearlyCalendarConstants() {
  assert.deepEqual(VALID_YEARLY_CALENDAR_ENTRY_TYPES, ['week_event', 'day_event', 'food', 'closed', 'note']);
  assert.deepEqual(VALID_YEARLY_CALENDAR_COLORS, ['red', 'yellow', 'green', 'blue', 'orange', 'pink', 'purple']);
}

function testYearlyCalendarNewsletterSupport() {
  assert.equal(supportsYearlyCalendarNewsletter('day_event'), true);
  assert.equal(supportsYearlyCalendarNewsletter('closed'), true);
  assert.equal(supportsYearlyCalendarNewsletter('week_event'), false);
  assert.equal(supportsYearlyCalendarNewsletter('food'), false);
  assert.equal(supportsYearlyCalendarNewsletter('note'), false);
  assert.equal(supportsYearlyCalendarNewsletter('not-real'), false);
}

function testYearlyCalendarValidNorwegianRow() {
  const result = validateYearlyCalendarImportRow({
    rowNumber: 2,
    schoolYear: 2027,
    row: validDayRow(),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.payload, {
    schoolYear: 2027,
    year: 2028,
    month: 6,
    entryType: 'day_event',
    title: 'Sommerfest',
    description: 'Sommerfest for alle',
    color: 'green',
    weekNumber: null,
    weekNumberEnd: null,
    date: '2028-06-04',
    showOnHomepage: true,
    showForParents: false,
  });
}

function testYearlyCalendarValidCamelCaseRow() {
  const result = validateYearlyCalendarImportRow({
    rowNumber: 3,
    schoolYear: 2027,
    row: {
      entryType: 'note',
      title: 'Husk regnt\u00f8y',
      year: 2027,
      month: 10,
      weekNumber: 41,
      weekNumberEnd: 42,
      description: 'Ta med ekstra skift',
      color: 'blue',
      showOnHomepage: true,
      showForParents: true,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.entryType, 'note');
  assert.equal(result.payload.weekNumber, 41);
  assert.equal(result.payload.weekNumberEnd, 42);
  assert.equal(result.payload.showOnHomepage, false);
  assert.equal(result.payload.showForParents, false);
}

function testYearlyCalendarInvalidRows() {
  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ tittel: '   ' }),
    }),
    'Mangler tittel',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'event' }),
    }),
    'Ugyldig entry_type "event"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'DAY_EVENT' }),
    }),
    'Ugyldig entry_type "DAY_EVENT"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ farge: 'grey' }),
    }),
    'Fargen "grey"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ farge: 'Green' }),
    }),
    'Fargen "Green"',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ dato: '2029-02-01', [YEAR_COLUMN]: 2029, [MONTH_COLUMN]: 2 }),
    }),
    'utenfor barnehage\u00e5ret 2027/2028',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ dato: '2028-02-31', [YEAR_COLUMN]: 2028, [MONTH_COLUMN]: 2 }),
    }),
    'YYYY-MM-DD',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ entry_type: 'closed', dato: '' }),
    }),
    'closed krever dato',
  );

  const emptyColor = validateYearlyCalendarImportRow({
    rowNumber: 16,
    schoolYear: 2027,
    row: validDayRow({ farge: '   ' }),
  });
  assert.equal(emptyColor.ok, true);
  assert.equal(emptyColor.payload.color, null);

  const hexColor = validateYearlyCalendarImportRow({
    rowNumber: 17,
    schoolYear: 2027,
    row: validDayRow({ farge: '#3B82F6' }),
  });
  assert.equal(hexColor.ok, true);
  assert.equal(hexColor.payload.color, '#3b82f6');

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ tittel: 'T'.repeat(201) }),
    }),
    'Tittel',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ beskrivelse: 'B'.repeat(1001) }),
    }),
    'Beskrivelse',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ [HOMEPAGE_COLUMN]: 'sure' }),
    }),
    'vis_p\u00e5_forside',
  );

  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validDayRow({ for_foreldre: 'maybe' }),
    }),
    'for_foreldre',
  );
}

function testYearlyCalendarWeekNumberRules() {
  assertInvalidContains(
    validateYearlyCalendarImportRow({
      rowNumber: 12,
      schoolYear: 2027,
      row: validWeekRow({ uke_til: 38 }),
    }),
    'uke_til',
  );

  for (const entryType of ['week_event', 'food', 'note']) {
    assertInvalidContains(
      validateYearlyCalendarImportRow({
        rowNumber: 12,
        schoolYear: 2027,
        row: validWeekRow({ entry_type: entryType, uke_fra: '' }),
      }),
      `${entryType} krever uke_fra`,
    );

    assertInvalidContains(
      validateYearlyCalendarImportRow({
        rowNumber: 12,
        schoolYear: 2027,
        row: validWeekRow({ entry_type: entryType, uke_fra: 54 }),
      }),
      `${entryType} krever uke_fra`,
    );
  }

  const food = validateYearlyCalendarImportRow({
    rowNumber: 13,
    schoolYear: 2027,
    row: validWeekRow({ entry_type: 'food', tittel: 'Fiskesuppe', uke_til: 1 }),
  });
  assert.equal(food.ok, true);
  assert.equal(food.payload.weekNumber, 38);
  assert.equal(food.payload.weekNumberEnd, null);
}

function testYearlyCalendarHomepageFlags() {
  const dayEvent = validateYearlyCalendarImportRow({
    rowNumber: 14,
    schoolYear: 2027,
    row: validDayRow({ [HOMEPAGE_COLUMN]: 'true', for_foreldre: 'ja' }),
  });
  assert.equal(dayEvent.ok, true);
  assert.equal(dayEvent.payload.showOnHomepage, true);
  assert.equal(dayEvent.payload.showForParents, true);

  const closed = validateYearlyCalendarImportRow({
    rowNumber: 15,
    schoolYear: 2027,
    row: validDayRow({ entry_type: 'closed', [HOMEPAGE_COLUMN]: true, for_foreldre: true }),
  });
  assert.equal(closed.ok, true);
  assert.equal(closed.payload.showOnHomepage, false);
  assert.equal(closed.payload.showForParents, false);
}

function testYearlyCalendarDiff() {
  const changes = diffYearlyCalendarEntry(
    {
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-02',
      title: 'Sommerfest',
      description: null,
      color: 'green',
      showOnHomepage: true,
      showForParents: false,
    },
    {
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-04',
      title: 'Sommerfest',
      description: null,
      color: 'blue',
      showOnHomepage: true,
      showForParents: false,
    },
  );

  assert.deepEqual(changes, [
    { field: 'date', label: 'dato', oldValue: '2028-06-02', newValue: '2028-06-04' },
    { field: 'color', label: 'farge', oldValue: 'green', newValue: 'blue' },
  ]);
}

function testYearlyCalendarImportPreview() {
  const existingEntries = [
    {
      id: 10,
      schoolYear: 2027,
      year: 2028,
      month: 6,
      entryType: 'day_event',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2028-06-02',
      title: 'Sommerfest',
      description: null,
      color: 'green',
      showOnHomepage: true,
      showForParents: false,
    },
    {
      id: 11,
      schoolYear: 2027,
      year: 2027,
      month: 12,
      entryType: 'closed',
      weekNumber: null,
      weekNumberEnd: null,
      date: '2027-12-24',
      title: 'Julaften',
      description: null,
      color: 'red',
      showOnHomepage: false,
      showForParents: false,
    },
    {
      id: 12,
      schoolYear: 2027,
      year: 2027,
      month: 9,
      entryType: 'week_event',
      weekNumber: 36,
      weekNumberEnd: null,
      date: null,
      title: 'Dugnad',
      description: null,
      color: 'orange',
      showOnHomepage: false,
      showForParents: false,
    },
    {
      id: 13,
      schoolYear: 2027,
      year: 2027,
      month: 10,
      entryType: 'week_event',
      weekNumber: 40,
      weekNumberEnd: null,
      date: null,
      title: 'Dugnad',
      description: null,
      color: 'orange',
      showOnHomepage: false,
      showForParents: false,
    },
  ];

  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries,
    rows: [
      { rowNumber: 2, ...validDayRow({ dato: '2028-06-04', beskrivelse: '' }) },
      {
        rowNumber: 3,
        entry_type: 'closed',
        tittel: 'Julaften',
        dato: '2027-12-24',
        [YEAR_COLUMN]: 2027,
        [MONTH_COLUMN]: 12,
        farge: 'red',
      },
      { rowNumber: 4, ...validWeekRow() },
      { rowNumber: 5, ...validWeekRow({ entry_type: 'bad_type' }) },
      { rowNumber: 6, ...validWeekRow({ tittel: ' dugnad ' }) },
    ],
  });

  assert.equal(preview.rows[0].status, 'changed');
  assert.deepEqual(preview.rows[0].changes, [
    { field: 'date', label: 'dato', oldValue: '2028-06-02', newValue: '2028-06-04' },
  ]);
  assert.equal(preview.rows[1].status, 'unchanged');
  assert.equal(preview.rows[2].status, 'new');
  assert.equal(preview.rows[3].status, 'invalid');
  assert.equal(preview.rows[4].status, 'ambiguous');
  assert.deepEqual(preview.counts, {
    new: 1,
    unchanged: 1,
    changed: 1,
    invalid: 1,
    ambiguous: 1,
  });
}

function testYearlyCalendarImportPreviewFiltersDbShapedSchoolYear() {
  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: [
      {
        id: 20,
        school_year: 2026,
        year: 2027,
        month: 6,
        entry_type: 'day_event',
        week_number: null,
        week_number_end: null,
        date: '2027-06-04',
        title: 'Sommerfest',
        description: null,
        color: 'green',
        show_on_homepage: true,
        show_for_parents: false,
      },
    ],
    rows: [
      {
        rowNumber: 2,
        ...validDayRow({ beskrivelse: '', dato: '2028-06-04' }),
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'new');
  assert.deepEqual(preview.counts, {
    new: 1,
    unchanged: 0,
    changed: 0,
    invalid: 0,
    ambiguous: 0,
  });
}

function testYearlyCalendarImportPreviewNormalizesDbShapedMatch() {
  const preview = buildImportPreview({
    schoolYear: 2027,
    existingEntries: [
      {
        id: 21,
        school_year: 2027,
        year: 2028,
        month: 6,
        entry_type: 'day_event',
        week_number: null,
        week_number_end: null,
        date: '2028-06-04',
        title: 'Sommerfest',
        description: '',
        color: 'green',
        show_on_homepage: true,
        show_for_parents: false,
      },
    ],
    rows: [
      {
        rowNumber: 2,
        ...validDayRow({ beskrivelse: '', dato: '2028-06-04' }),
      },
    ],
  });

  assert.equal(preview.rows[0].status, 'unchanged');
  assert.equal(preview.rows[0].existing.schoolYear, 2027);
  assert.equal(preview.rows[0].existing.entryType, 'day_event');
  assert.equal(preview.rows[0].existing.weekNumber, null);
  assert.equal(preview.rows[0].existing.showOnHomepage, true);
  assert.equal(preview.rows[0].existing.showForParents, false);
}

function testYearlyCalendarImportDecisionMatrix() {
  const allowed = [
    ['new', 'create'],
    ['new', 'ignore'],
    ['unchanged', 'ignore'],
    ['changed', 'update'],
    ['changed', 'create'],
    ['changed', 'ignore'],
    ['ambiguous', 'create'],
    ['ambiguous', 'ignore'],
    ['invalid', 'ignore'],
  ];

  for (const [status, action] of allowed) {
    assert.deepEqual(validateImportDecision({ status, action }), { ok: true });
  }

  const rejected = [
    ['new', 'update'],
    ['unchanged', 'create'],
    ['unchanged', 'update'],
    ['ambiguous', 'update'],
    ['invalid', 'create'],
    ['invalid', 'update'],
  ];

  for (const [status, action] of rejected) {
    const result = validateImportDecision({ status, action });
    assert.equal(result.ok, false);
    assert.match(result.error, /not allowed/);
  }
}

function testContactReplyEmail() {
  assert.equal(contactSubjectLabel('concern'), 'Bekymringsmelding');
  assert.equal(contactSubjectLabel('concern', 'en'), 'Concern');
  assert.equal(contactSubjectLabel('ukjent'), 'ukjent');

  const { subject, text } = contactReplyEmail(
    {
      name: 'Kari Nordmann',
      subject: 'general',
      message: 'Hei!\nNår er neste dugnad?',
      createdAt: '2026-05-04T09:00:00.000Z',
    },
    'Neste dugnad er 12. mai.',
  );

  assert.match(subject, /Svar på din henvendelse til FAU Erdal Barnehage: Generell henvendelse/);
  assert.match(text, /^Hei Kari Nordmann,/);
  assert.match(text, /Neste dugnad er 12\. mai\./);
  assert.match(text, /Med vennlig hilsen\nFAU Erdal Barnehage/);
  // Original inquiry is quoted back, every line prefixed.
  assert.match(text, /> Hei!\n> Når er neste dugnad\?/);

  // Anonymous-style rows have no name: fall back to a neutral greeting, and an
  // unparsable timestamp must not produce "Invalid Date" in the email.
  const withoutName = contactReplyEmail(
    { name: '', subject: 'anonymous', message: 'Anonymt tips', createdAt: 'ikke-en-dato' },
    'Takk for tipset.',
  );
  assert.match(withoutName.text, /^Hei,/);
  assert.equal(/Invalid Date/.test(withoutName.text), false);
  assert.match(withoutName.text, /Din opprinnelige henvendelse:/);
}

function testContactAcknowledgementEmail() {
  const no = contactAcknowledgementEmail({
    name: 'Kari Nordmann',
    subject: 'general',
    receivedAt: '2026-05-04T09:00:00.000Z',
  });
  assert.match(no.subject, /Vi har mottatt din henvendelse/);
  assert.match(no.text, /^Hei Kari Nordmann,/);
  assert.match(no.text, /besvare den så snart som mulig/);
  assert.match(no.text, /Emne: Generell henvendelse/);
  assert.match(no.text, /Mottatt: /);
  assert.match(no.text, /FAU Erdal Barnehage/);

  const en = contactAcknowledgementEmail({ name: 'Kari', subject: 'feedback', language: 'en' });
  assert.match(en.subject, /We have received your inquiry/);
  assert.match(en.text, /^Hi Kari,/);
  assert.match(en.text, /Subject: Feedback/);

  // The receipt must never echo the submitted message back out: the form is
  // public and takes any recipient address, so quoting it would make the site
  // a relay for arbitrary mail.
  const withMessage = contactAcknowledgementEmail({
    name: 'Kari',
    subject: 'general',
    message: 'KJØP BILLIGE PILLER http://spam.example',
  });
  assert.equal(/spam\.example/.test(withMessage.text), false);

  // An unparsable timestamp must not leak "Invalid Date" into the email.
  const badDate = contactAcknowledgementEmail({ subject: 'concern', receivedAt: 'ikke-en-dato' });
  assert.equal(/Invalid Date/.test(badDate.text), false);
  assert.equal(/Mottatt:/.test(badDate.text), false);
  assert.match(badDate.text, /^Hei,/);
}

testSanitizeHtml();
testVideoEmbedCsp();
testContactReplyEmail();
testContactAcknowledgementEmail();
testRateLimitKeys();
testCloudinaryDeliveryUrlParsing();
testAssignPhotoSlots();
testResolvePhotoSlotsForRegistration();
testSharedConstants();
testPasswordPolicy();
testClientRegressionGuards();
testYearlyCalendarDateHelpers();
testYearlyCalendarMonthGroups();
testYearlyCalendarTodayMarker();
testYearlyCalendarConstants();
testYearlyCalendarNewsletterSupport();
testYearlyCalendarTitleNormalization();

// PostgreSQL does not apply a second update to a row already updated by the
// same statement (manual 7.8.2, "Data-Modifying Statements in WITH"): the
// second one is silently skipped, no error, no returned row. The registration
// handler used to rely on exactly that — a capacity_update CTE incremented
// events.current_attendees and a rollback_capacity CTE tried to undo it when no
// registration was inserted. The rollback never ran, so every duplicate signup
// permanently consumed a seat and capacity-limited events eventually refused
// genuine parents. Guard the shape, not the symptom: the registration statement
// must contain exactly one UPDATE of `events`.

// A backtick inside a SQL comment terminates the JavaScript template literal
// that the query lives in. tsc reports it, but as a bare "',' expected" a few
// lines away from the real cause, so name it here where the message can say
// what actually happened.

// The Excel import binds a sheet row to an existing entry. Matching on the
// title alone made every row sharing a title resolve to the same database row,
// so approving the preview destroyed entries and skipped others. Identity must
// include where the entry sits in the year.
function testImportMatchesOnMoreThanTitle() {
  const utils = readFileSync(new URL('../shared/yearly-calendar-utils.js', import.meta.url), 'utf8');
  assert.match(
    utils,
    /function positionOf/,
    'pairing must consider where an entry sits in the year, not only its title',
  );
  assert.doesNotMatch(
    utils,
    /entriesByTitle/,
    'title-only matching binds every same-titled sheet row to one entry',
  );
  assert.match(
    utils,
    /candidates\.length === 1 && rowIndexes\.length === 1/,
    'a lone entry matched by a lone row must still pair, so a corrected date reads as an edit',
  );

  // The import UPDATE must not clear fields the preview never diffed.
  const yearlyApi = readFileSync(new URL('../api/yearly-calendar.js', import.meta.url), 'utf8');
  const commitStart = yearlyApi.indexOf("if (action === 'update')");
  const commitEnd = yearlyApi.indexOf("if (action === 'create')", commitStart);
  const updateBlock = yearlyApi.slice(commitStart, commitEnd);
  assert.doesNotMatch(
    updateBlock,
    /weekday_start\s*=/,
    'the import UPDATE must preserve weekday_start/weekday_end — the preview cannot show that they change',
  );
}


// Write paths in secure-settings.js returned raw `RETURNING *` rows while its
// reads aliased to camelCase. content.tsx feeds a write response straight into
// render state, where publishedDate/showOnHomepage read undefined — and the
// next toggle sent that back, resetting the post's publish date to today.
function testSecureSettingsMapsWriteResponses() {
  const source = readFileSync(new URL('../api/secure-settings.js', import.meta.url), 'utf8');
  for (const mapper of ['mapBlogPost', 'mapBoardMember', 'mapKindergartenInfo', 'mapContactMessage']) {
    assert.match(source, new RegExp(`function ${mapper}\\(`), `${mapper} should define the wire shape`);
  }
  const rawReturns = source.match(/return res\.status\((?:200|201)\)\.json\(result\[0\]\)/g) ?? [];
  assert.equal(
    rawReturns.length,
    0,
    `${rawReturns.length} write path(s) still return a raw snake_case row instead of a mapped one`,
  );
}

// Unvalidated ids reached integer columns and produced 500s; DELETEs answered
// 200 "deleted successfully" without checking that anything matched.
function testDeletesValidateIdAndCheckRows() {
  const source = readFileSync(new URL('../api/secure-settings.js', import.meta.url), 'utf8');
  assert.doesNotMatch(
    source,
    /const \{ id \} = req\.query/,
    'secure-settings must take ids through requireIntId, not raw off the query string',
  );
  // Compensating deletes are exempt: they undo a row this same request just
  // created, so "no row matched" is not a case they need to distinguish.
  // Listed explicitly rather than pattern-matched, so a NEW unchecked delete
  // fails here and has to be looked at.
  const COMPENSATING_DELETES = [
    'DELETE FROM users WHERE id = ${created[0].id}',
  ];

  const deleteBlocks = source.match(/DELETE FROM \w+[\s\S]{0,200}?`;/g) ?? [];
  for (const block of deleteBlocks) {
    if (COMPENSATING_DELETES.some((exempt) => block.includes(exempt))) continue;
    assert.match(
      block,
      /RETURNING/,
      `a DELETE without RETURNING cannot tell a real deletion from a no-op:\n${block}`,
    );
  }
}

function testNoBackticksInsideSqlComments() {
  const files = [
    'api/registrations.js', 'api/events.js', 'api/contact.js', 'api/documents.js',
    'api/auth.js', 'api/upload.js', 'api/yearly-calendar.js', 'api/secure-settings.js',
    'api/cron/event-reminders.js',
  ];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    source.split('\n').forEach((line, index) => {
      const comment = line.match(/^\s*--\s(.*)$/);
      if (comment && comment[1].includes('`')) {
        assert.fail(
          `${file}:${index + 1} has a backtick inside a SQL comment, which ends the `
            + 'surrounding template literal. Write the term without backticks.',
        );
      }
    });
  }
}

// PERF-003. /kalender.ics is public and polled repeatedly by every subscribed
// calendar client, and production was returning `public, max-age=0,
// must-revalidate` — two database queries per poll, nothing cached at the edge.
// The no-store rule in vercel.json cannot fix it: header rules there are
// matched against the PRE-rewrite path, so `/api/(.*)` never sees /kalender.ics.
// The header has to come from the handler.
function testCalendarFeedIsCacheable() {
  const eventsApi = readFileSync(new URL('../api/events.js', import.meta.url), 'utf8');

  assert.match(
    eventsApi,
    /export const CALENDAR_FEED_CACHE_CONTROL\s*=\s*\n?\s*'public, max-age=\d+, s-maxage=\d+, stale-while-revalidate=\d+'/,
    'The calendar feed should declare a shared-cache lifetime',
  );

  const feedStart = eventsApi.indexOf('async function respondWithCalendarFeed');
  assert.ok(feedStart !== -1, 'The ICS feed should live in respondWithCalendarFeed');
  const feedBody = eventsApi.slice(feedStart, eventsApi.indexOf('\n}', feedStart));
  assert.match(
    feedBody,
    /setHeader\('Cache-Control', CALENDAR_FEED_CACHE_CONTROL\)/,
    'The feed response must set Cache-Control itself, not rely on vercel.json',
  );

  const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const apiRule = vercelConfig.headers.find((rule) => rule.source === '/api/(.*)');
  assert.ok(apiRule, 'The API routes should still be no-store by default');
  assert.match(
    apiRule.headers.find((header) => header.key === 'Cache-Control').value,
    /no-store/,
    'Only the feed path is cacheable; every other API route stays no-store',
  );
}

// DB-002. events.current_attendees is a stored counter with three writers and,
// until migration 0012, no way back once it drifted. Nothing should render it:
// the read paths compute the sum of the registrations that exist right now.
function testAttendeeCountIsDerivedOnRead() {
  const eventsApi = readFileSync(new URL('../api/events.js', import.meta.url), 'utf8');

  assert.match(
    eventsApi,
    /currentAttendees: row\.derived_attendees \?\? row\.current_attendees/,
    'mapEvent should prefer the derived count over the stored counter',
  );

  const derivations = eventsApi.match(
    /SELECT COALESCE\(SUM\(r\.attendee_count\), 0\)::int[\s\S]{0,120}?AS derived_attendees/g,
  ) ?? [];
  assert.ok(
    derivations.length >= 4,
    `Every path that returns an event to the client should derive the count (found ${derivations.length})`,
  );

  // The counter still exists, and the capacity check still compares against it
  // under FOR UPDATE. Deriving it there instead would reintroduce the last-seat
  // race: a single statement takes one snapshot, so the sum would not see a
  // registration committed by the transaction this one just waited behind.
  const registrations = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  assert.match(
    registrations,
    /COALESCE\(current_attendees, 0\) \+ \$\{requestedAttendees\} <= max_attendees/,
    'The capacity check must keep comparing the locked counter, not a snapshot sum',
  );

  const cron = readFileSync(new URL('../api/cron/event-reminders.js', import.meta.url), 'utf8');
  assert.match(
    cron,
    /export async function reconcileEventAttendeeCounts/,
    'Something must reconcile the counter against the rows it counts',
  );
  assert.match(
    cron,
    /WHERE e\.id = d\.id\s*\n\s*AND COALESCE\(e\.current_attendees, 0\) = d\.stored/,
    'Reconciliation must stand down when it races a live registration',
  );
}

// DB-003/DB-004. The outbox is one row per item per subscriber; nothing ever
// deleted from it, and it copied up to 4 000 characters of the item body into
// every one of those rows. An undeliverable address kept its row pending
// forever, which also kept the source item unstamped and re-queued nightly.
function testNewsletterOutboxIsBounded() {
  const cron = readFileSync(new URL('../api/cron/event-reminders.js', import.meta.url), 'utf8');

  assert.match(
    cron,
    /const MAX_DELIVERY_ATTEMPTS = \d+/,
    'Delivery attempts must be bounded so a row can reach a terminal state',
  );
  assert.match(
    cron,
    /status = \$\{exhausted \? 'failed' : 'pending'\}/,
    'An exhausted delivery must be retired rather than released for another retry',
  );
  assert.match(
    cron,
    /DELETE FROM newsletter_deliveries[\s\S]*?status IN \('sent', 'skipped', 'failed'\)/,
    'Terminal delivery rows must be collected on a retention schedule',
  );
  assert.doesNotMatch(
    cron,
    /DELETE FROM newsletter_deliveries[\s\S]*?status IN \([^)]*'pending'/,
    'Retention must never collect a delivery that has not been attempted to the end',
  );
  assert.match(
    cron,
    /SELECT d\.item_type, d\.item_id, s\.id, d\.title, NULL::text, d\.event_date/,
    'The queue insert must not copy the item body into one row per subscriber',
  );
  assert.match(
    cron,
    /LEFT JOIN blog_posts bp ON c\.item_type = 'news' AND bp\.id = c\.item_id/,
    'The claim must read the item body at send time instead',
  );
}

function testRegistrationUpdatesEventRowOnce() {
  const registrations = readFileSync(new URL('../api/registrations.js', import.meta.url), 'utf8');
  const statementStart = registrations.indexOf('WITH target_event AS');
  assert.ok(statementStart !== -1, 'Registration CTE should start with a target_event lookup');
  const statementEnd = registrations.indexOf('AS registration', statementStart);
  assert.ok(statementEnd !== -1, 'Registration CTE should project the inserted registration');
  const statement = registrations.slice(statementStart, statementEnd);

  const eventUpdates = statement.match(/UPDATE\s+events\b/g) ?? [];
  assert.equal(
    eventUpdates.length,
    1,
    `Registration statement must UPDATE events exactly once (found ${eventUpdates.length}); `
      + 'a compensating second UPDATE of the same row is silently skipped by PostgreSQL',
  );

  assert.doesNotMatch(
    statement,
    /rollback_capacity/,
    'rollback_capacity cannot work: it updates a row the same statement already updated',
  );

  // The single UPDATE must be conditional on the insert having happened, or the
  // counter inflates again on the duplicate-email and ON CONFLICT paths.
  assert.match(
    statement,
    /UPDATE events[\s\S]*?EXISTS \(SELECT 1 FROM inserted_registration\)/,
    'The events UPDATE must be gated on a registration actually being inserted',
  );

  // Concurrent signups for the last seat are serialized by locking the event row.
  assert.match(
    statement,
    /FOR UPDATE/,
    'target_event must lock the event row so concurrent signups cannot both pass the capacity check',
  );
}

testNoBackticksInsideSqlComments();
testImportMatchesOnMoreThanTitle();
testSecureSettingsMapsWriteResponses();
testDeletesValidateIdAndCheckRows();
testRegistrationUpdatesEventRowOnce();
testCalendarFeedIsCacheable();
testAttendeeCountIsDerivedOnRead();
testNewsletterOutboxIsBounded();
testYearlyCalendarValidNorwegianRow();
testYearlyCalendarValidCamelCaseRow();
testYearlyCalendarInvalidRows();
testYearlyCalendarWeekNumberRules();
testYearlyCalendarHomepageFlags();
testYearlyCalendarDiff();
testYearlyCalendarImportPreview();
testYearlyCalendarImportPreviewFiltersDbShapedSchoolYear();
testYearlyCalendarImportPreviewNormalizesDbShapedMatch();
testYearlyCalendarImportDecisionMatrix();

console.log('Smoke tests passed');
