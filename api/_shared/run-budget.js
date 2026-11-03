// How long a scheduled run may keep working. Shared by the cron handler and
// the work it runs (reminders, the newsletter outbox).
// vercel.json gives these functions maxDuration: 30. Stop sending at 23 s so
// the run exits under its own control — a kill at 30 s leaves rows claimed as
// 'processing' with no send record. Previously the claim query flipped the
// whole batch to 'processing' before a single message was sent, so a timeout
// stranded every unsent row in it.
export const RUN_BUDGET_MS = 23_000;

export function deadlineFrom(startedAt = Date.now()) {
  return startedAt + RUN_BUDGET_MS;
}
