# CLAUDE.md — FAU Erdal Barnehage

Repository facts, architecture, conventions, commands and safety boundaries live
in `AGENTS.md`, imported below. Edit `AGENTS.md`, not this file, for anything
about the repository. This file holds only Claude Code workflow notes.

@AGENTS.md

## Working efficiently in this repo

- The map and routing table in `AGENTS.md` are usually enough to find the right
  file. Grep for a symbol before opening anything; reserve a full read for files
  under ~300 lines.
- Never read these whole: `client/src/lib/i18n.ts` (~2.5k lines — grep a nearby
  translation key and edit both `no` and `en` in place), `package-lock.json`,
  `client/src/components/ui/**`, and the audit documents under `docs/reviews/`.
- Load `docs/subsystems.md`, `docs/architecture.md`, `docs/DEPLOYMENT.md` or
  `docs/review-backlog.md` only when the task actually touches them — they are
  deliberately not part of the always-loaded context.
- **Visual changes are the exception: always read `docs/design/style-guide.md`
  first** (grep a section heading, e.g. `## 7.` or `## 21.`, rather than
  loading all of it). Use the text version; the PDF next to it is the
  original and needs a renderer.
- Before adding a pattern, read one sibling: another `api/*.js` handler, another
  page in `client/src/pages/`, or another suite in `tests/`.

## Validation ladder

Run the cheapest step that covers the change; escalate only as needed.

1. `npm ci` once per session (`node_modules` is often absent on a fresh clone).
2. `node --test tests/<suite>.test.mjs` while iterating on `api/_shared/` or
   `shared/` logic.
3. `npm run check` after any TypeScript or user-facing-string change — it also
   runs the i18n ratchet, which fails on new inline Norwegian/English branches.
4. `npm test` before handing work back.
5. `npm run build` only for `client/`, Vite or Tailwind changes.
6. `npm run verify` when you want the full CI gate in one command.

Documentation-only changes need none of these. `api/` handlers cannot be run
locally — verify them through the extracted logic in `api/_shared/` and the
suites in `tests/`, and say so plainly rather than implying a live check.
