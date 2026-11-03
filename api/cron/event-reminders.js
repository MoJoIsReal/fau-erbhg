import crypto from 'crypto';
import { getDb } from '../_shared/database.js';
import { withApiHandler } from '../_shared/middleware.js';
import { sendPooledEmail, closePooledTransporter, isEmailConfigured } from '../_shared/email.js';
import { redactSensitiveText } from '../_shared/redact.js';
import { reportProviderError } from '../_shared/provider-errors.js';
import { getRequestId, logEvent } from '../_shared/log.js';
import {
  DELIVERY_CONCURRENCY,
  DELIVERY_LEASE_MINUTES,
  deliveryMessageId,
  runWithConcurrency,
  sendWithDeadline,
} from '../_shared/delivery.js';
import { osloToday } from '../_shared/registration-cancel.js';
import { registrationReminderEmail } from '../_shared/registration-emails.js';
import { purgeExpiredShares } from '../_shared/media-share.js';
import { isR2Configured } from '../_shared/r2.js';
import { purgeUnusedEditorImages } from '../_shared/document-assets.js';
import { deadlineFrom } from '../_shared/run-budget.js';
import { broadcastNewsletter } from '../_shared/newsletter-outbox.js';
import {
  cleanupAuditLog,
  cleanupDeliveryHistory,
  cleanupExpiredRateLimits,
  cleanupPrivacyRetention,
  reconcileEventAttendeeCounts,
} from '../_shared/retention.js';

// The scheduled handler: the morning run (housekeeping, then registration
// reminders, then any newsletter mail the evening run left) and the evening
// newsletter run. The work itself lives in api/_shared/: retention.js,
// newsletter-outbox.js and the reminder mail in registration-emails.js.

// Per-batch claim sizes. These are upper bounds on what one claim query takes;
// the real protection against being killed mid-batch is RUN_BUDGET_MS below,
// which stops the loop while there is still time to finish cleanly.
const MAX_REMINDERS_PER_RUN = 100;

// A reminder whose send fails is released and, when the batch was full,
// claimed again by the next batch of the same run. Without a bound one
// address that can never be delivered to was retried batch after batch until
// the run's budget ran out. reminder_attempts counts sends tried (a deferred
// claim gives its attempt back), and a registration stops being claimed here.
const MAX_REMINDER_ATTEMPTS = 3;

// Fails closed. Without CRON_SECRET set this used to authorize anyone whenever
// NODE_ENV was not exactly 'production' — and an anonymous GET to this route
// sends mail and runs the irreversible GDPR retention DELETE, against a
// caller-supplied ?date=. A preview deployment, or a production deployment that
// simply never had NODE_ENV set, was wide open. `.env.example` documents
// CRON_SECRET; local runs set it there.
//
// Compared in constant time, the way validateCsrfToken compares its pair: `===`
// returns at the first differing character, so response timing could reveal
// the secret one character at a time. Byte lengths are checked first because
// timingSafeEqual throws on buffers of different lengths.
export function isAuthorizedCron(req) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers?.authorization;
  if (!secret || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// The calendar day before an ISO date, as 'YYYY-MM-DD'.
function previousDay(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function tomorrowInOslo() {
  return osloToday(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

// Claim and send registration reminders for `targetDate`, in batches, until
// there is nothing left or the run budget is spent.
//
// This used to be inline in the handler with a hard LIMIT of 25 and a single
// pass, so an event with 60 registrations silently reminded 25 parents and
// never the other 35 — the next run computes a new targetDate, the event is no
// longer "tomorrow", and reminder_sent_at stays NULL forever. The response
// reported `sent: 25`, which looked healthy. Extracting it also makes the
// send/failure paths reachable from tests, which the inline version was not.
export async function sendEventReminders(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom()) {
  let sent = 0;
  let failed = 0;
  let claimedTotal = 0;
  let deferred = 0;

  if (!isEmailConfigured()) throw new Error('Email configuration not available');

  for (;;) {
    if (Date.now() >= deadline) break;

    const claimed = await sql`
      WITH due AS (
        SELECT
          r.id,
          r.name,
          r.email,
          r.language,
          r.attendee_count as "attendeeCount",
          r.photo_slots as "photoSlots",
          r.children_names as "childrenNames",
          r.cancel_token as "cancelToken",
          e.title as "eventTitle",
          e.date as "eventDate",
          e.time as "eventTime",
          e.location,
          e.custom_location as "customLocation",
          e.potluck
        FROM event_registrations r
        JOIN events e ON e.id = r.event_id
        WHERE e.status = 'active'
          AND e.date = ${targetDate}
          AND r.reminder_sent_at IS NULL
          AND r.reminder_attempts < ${MAX_REMINDER_ATTEMPTS}
          AND (r.reminder_claimed_at IS NULL OR r.reminder_claimed_at < NOW() - (${DELIVERY_LEASE_MINUTES} * INTERVAL '1 minute'))
        ORDER BY e.time ASC, r.id ASC
        FOR UPDATE OF r SKIP LOCKED
        LIMIT ${MAX_REMINDERS_PER_RUN}
      ),
      claimed AS (
        UPDATE event_registrations r
        SET reminder_claimed_at = NOW(), reminder_attempts = reminder_attempts + 1
        FROM due
        WHERE r.id = due.id
          AND r.reminder_sent_at IS NULL
          AND (r.reminder_claimed_at IS NULL OR r.reminder_claimed_at < NOW() - (${DELIVERY_LEASE_MINUTES} * INTERVAL '1 minute'))
        RETURNING r.id, r.reminder_attempts as "reminderAttempts"
      )
      SELECT due.*, claimed."reminderAttempts"
      FROM due
      JOIN claimed ON claimed.id = due.id
    `;

    if (claimed.length === 0) break;
    claimedTotal += claimed.length;

    await runWithConcurrency(claimed, DELIVERY_CONCURRENCY, async (registration) => {
      if (Date.now() >= deadline) {
        // No send was attempted: release without consuming an attempt.
        deferred += 1;
        await sql`
          UPDATE event_registrations
          SET reminder_claimed_at = NULL, reminder_attempts = GREATEST(0, reminder_attempts - 1)
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        return;
      }
      try {
        const { subject, text } = registrationReminderEmail(registration);
        await sendWithDeadline(send, {
          to: registration.email,
          subject,
          text,
          messageId: deliveryMessageId('registration-reminder', registration.id),
        }, deadline, closePooledTransporter);
        await sql`
          UPDATE event_registrations
          SET reminder_sent_at = ${new Date().toISOString()}, reminder_claimed_at = NULL
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        sent += 1;
      } catch (emailError) {
        failed += 1;
        await sql`
          UPDATE event_registrations
          SET reminder_claimed_at = NULL
          WHERE id = ${registration.id} AND reminder_sent_at IS NULL
        `;
        reportProviderError('Failed to send event reminder', emailError);
      }
    });

    // A short batch means the queue is drained.
    if (claimed.length < MAX_REMINDERS_PER_RUN) break;
  }

  return { claimed: claimedTotal, sent, failed, deferred };
}

// Housekeeping runs first so mail cannot spend its budget or suppress it.
// Independent stages still run after a failure; the invocation fails with the
// original errors and logs its partial results instead of claiming success.
// Expired private media shares (docs/mediedeling.md): their files in R2 and
// their rows. Skipped, not failed, where R2 is not configured — there is then
// nothing in R2 to delete, and the share API refuses to create any.
export async function purgeMediaShares(sql) {
  if (!isR2Configured()) return null;
  const { sharesDeleted, filesDeleted, failed } = await purgeExpiredShares(sql);
  return { mediaSharesDeleted: sharesDeleted, mediaFilesDeleted: filesDeleted, mediaPurgeFailed: failed };
}

export async function runMorningTasks(sql, targetDate, send = sendPooledEmail, deadline = deadlineFrom(), context = {}) {
  const summary = { reminders: null, newsletter: null, retention: null, media: null, editorImages: null, attendeeCountsRepaired: null, expiredRateLimitsDeleted: null, deliveryHistoryDeleted: null, auditLogDeleted: null };
  const errors = [];
  const stage = async (name, work) => {
    try {
      summary[name] = await work();
    } catch (error) {
      errors.push({ stage: name, error });
      logEvent('error', 'cron.stage_failed', { ...context, stage: name, message: redactSensitiveText(error?.message || String(error)) });
      // On its own line, like the handler's: a stack is multi-line and longer
      // than a log field. Without it a failed stage could only be reproduced.
      if (error?.stack) console.error('cron.stage_failed stack:', redactSensitiveText(error.stack));
    }
  };
  try {
    await stage('retention', () => cleanupPrivacyRetention(sql));
    await stage('media', () => purgeMediaShares(sql));
    await stage('editorImages', () => purgeUnusedEditorImages(sql));
    // Reconcile after retention, including a partially completed purge.
    await stage('attendeeCountsRepaired', () => reconcileEventAttendeeCounts(sql));
    await stage('expiredRateLimitsDeleted', () => cleanupExpiredRateLimits(sql));
    await stage('deliveryHistoryDeleted', () => cleanupDeliveryHistory(sql));
    await stage('auditLogDeleted', () => cleanupAuditLog(sql));
    await stage('reminders', () => sendEventReminders(sql, targetDate, send, deadline));
    // The evening broadcast is capped per run and stops at its deadline. What
    // it left pending for an item dated today would otherwise be skipped by
    // tonight's run, which only sends items dated tomorrow. Last, so it only
    // uses time the morning's own work left over.
    await stage('newsletter', () => broadcastNewsletter(sql, previousDay(targetDate), send, deadline, { queue: false }));
  } finally {
    closePooledTransporter();
  }
  if (errors.length) {
    // A failing run still writes its cron.run line, naming the stages that
    // failed, so every run leaves one (the handler's error line and Sentry
    // event follow from the throw). Flattened: logEvent writes a nested
    // object as "[object Object]". A stage that failed has null here and
    // adds nothing.
    const stagesFailed = errors.map(({ stage: name }) => name);
    const { reminders, newsletter, retention, media, editorImages, ...counts } = summary;
    logEvent('error', 'cron.run', {
      ...context, task: 'reminders', targetDate, ...counts, ...retention, ...media, ...editorImages, ...reminders,
      stagesFailed: stagesFailed.join(','),
    });
    throw new AggregateError(errors.map(({ error }) => error), `Morning stage(s) failed: ${stagesFailed.join(', ')}`);
  }
  return summary;
}

// The counts in a run's summary that mean mail did not go out, when above
// zero. Each failed send is also reported on its own, but that says neither
// how many there were nor whether mail is piling up. A newsletter run
// leaves failures to retry (`remaining`) and retires some for good
// (`abandoned`); a reminder that fails or is deferred is never retried, since
// the next morning looks at a different day.
export function mailProblems(task, summary) {
  const keys = task === 'newsletter' ? ['failed', 'abandoned', 'remaining'] : ['failed', 'deferred'];
  const problems = {};
  for (const key of keys) {
    const count = Number(summary?.[key]) || 0;
    if (count > 0) problems[key] = count;
  }
  if (summary?.reason) problems.reason = summary.reason;
  return problems;
}

// Housekeeping that left something behind: an expired share whose private
// photos could not be deleted from R2, an unused editor image still public at
// Cloudinary, or rows whose date the privacy
// retention could not read and so never deletes. Neither is mail, but both
// keep personal data past its time, so they are reported the same way.
export function housekeepingProblems(task, summary) {
  if (task !== 'reminders') return {};
  const problems = {};
  for (const key of ['mediaPurgeFailed', 'editorImagesFailed', 'unparseableDates']) {
    const count = Number(summary?.[key]) || 0;
    if (count > 0) problems[key] = count;
  }
  return problems;
}

// Vercel Cron discards the response body, so the only durable record that a
// run happened is what gets logged. One line per run, so a cron that has been
// failing for a fortnight is visible instead of silent. A run that left mail
// unsent logs at warn and raises one error-tracker event under a fixed title,
// which is what the alert in docs/DEPLOYMENT.md listens for.
export function logCronRun(task, targetDate, summary, context = {}) {
  const problems = mailProblems(task, summary);
  const troubled = Object.keys(problems).length > 0;
  const leftovers = housekeepingProblems(task, summary);
  const untidy = Object.keys(leftovers).length > 0;
  // Written directly rather than through logEvent: every field here is a
  // count, the task or the date, so there is nothing to redact, and logEvent
  // would cap each value. Warn goes to stderr, as logEvent does it.
  const line = {
    level: troubled || untidy ? 'warn' : 'info', event: 'cron.run', ...context, task, targetDate, ...summary,
    mailProblems: troubled,
    ...(untidy ? { housekeepingProblems: true } : {}),
  };
  (troubled || untidy ? console.error : console.log)(JSON.stringify(line));
  const report = (title, found, code) => reportProviderError(
    title,
    Object.assign(new Error(Object.entries(found).map(([key, value]) => `${key}=${value}`).join(', ')), { code }),
  );
  if (troubled) report(`Mail delivery problems in the ${task} run`, problems, 'MAIL_DELIVERY_PROBLEMS');
  if (untidy) report(`Housekeeping problems in the ${task} run`, leftovers, 'HOUSEKEEPING_PROBLEMS');
  return line;
}

export default withApiHandler(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ?date= runs the job for another day (by hand, with the cron secret). A
  // value that is not a real date used to reach previousDay() and answer 500.
  if (req.query.date !== undefined && !isIsoDate(req.query.date)) {
    return res.status(400).json({ error: 'date must be a real date written as YYYY-MM-DD' });
  }
  const sql = getDb();
  const targetDate = req.query.date || tomorrowInOslo();
  const deadline = deadlineFrom();

  // Every line about this run carries the request id Vercel gave it.
  const requestId = getRequestId(req);
  const context = requestId ? { requestId } : {};
  const logRun = (task, summary) => logCronRun(task, targetDate, summary, context);

  // The evening run (21:00 Oslo / 19:00 UTC) only broadcasts the newsletter
  // for the next day's flagged events. Registration reminders + GDPR cleanup
  // stay on the morning run (07:00 UTC).
  if (req.query.task === 'newsletter') {
    try {
      const newsletter = await broadcastNewsletter(sql, targetDate, sendPooledEmail, deadline);
      logRun('newsletter', newsletter);
      return res.status(200).json({ success: true, targetDate, task: 'newsletter', newsletter });
    } finally {
      closePooledTransporter();
    }
  }

  const { reminders, newsletter, retention, media, editorImages, attendeeCountsRepaired, expiredRateLimitsDeleted, deliveryHistoryDeleted, auditLogDeleted } =
    await runMorningTasks(sql, targetDate, sendPooledEmail, deadline, context);
  // Its own line, under the newsletter's rules: what it still leaves pending
  // is lost tonight, and raises the newsletter's mail alert.
  // (Unconfigured mail already fails the reminders stage loudly.)
  if (newsletter && (newsletter.processed || newsletter.remaining || newsletter.reason === 'budget-exhausted')) {
    logCronRun('newsletter', previousDay(targetDate), { ...newsletter, followUp: true }, context);
  }
  logRun('reminders', {
    ...reminders,
    ...retention,
    ...media,
    ...editorImages,
    attendeeCountsRepaired,
    expiredRateLimitsDeleted,
    deliveryHistoryDeleted,
    auditLogDeleted,
  });
  return res.status(200).json({
    success: true,
    targetDate,
    sent: reminders.sent,
    failed: reminders.failed,
    deferred: reminders.deferred,
    newsletter,
    retention,
    media,
    editorImages,
    attendeeCountsRepaired,
    expiredRateLimitsDeleted,
    deliveryHistoryDeleted,
    auditLogDeleted,
  });
});
