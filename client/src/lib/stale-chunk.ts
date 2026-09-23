// A tab that stays open across a deploy still runs the old entry chunk, whose
// lazy routes point at hashed files the new deploy no longer has. Loading one
// fails with "Failed to fetch dynamically imported module"; the fix is a
// full reload, which picks up the new index.html and its current hashes.
// The timestamp guard stops a reload loop if the file is missing for some
// other reason.
const RELOAD_KEY = 'stale-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 10_000;

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|'text\/html' is not a valid JavaScript MIME type/i.test(message);
}

/** Reloads the page once per cooldown window. Returns true if it reloaded. */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway; the browser's own cache fix still applies.
  }
  window.location.reload();
  return true;
}
