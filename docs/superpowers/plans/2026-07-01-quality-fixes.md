# Quality Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Bør fikses snart" audit items without changing public API contracts or introducing a new test stack.

**Architecture:** Keep changes scoped to the client error boundary between `fetch` and UI, the content editor local-state model, and accessible names/states in the rich text editor. Add smoke regression guards because this repo currently has only `scripts/smoke-tests.mjs`.

**Tech Stack:** React, TypeScript, TanStack Query, TipTap, Node smoke tests.

---

### Task 1: Structured API Errors

**Files:**
- Modify: `client/src/lib/queryClient.ts`
- Modify: `client/src/pages/events.tsx`
- Modify: `scripts/smoke-tests.mjs`

- [ ] **Step 1: Write the failing regression guard**

Add smoke assertions that `queryClient.ts` exports `ApiError`, parses JSON response bodies, and that `events.tsx` reads structured error bodies instead of `error.response.data`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test`
Expected: FAIL because `ApiError` does not exist yet.

- [ ] **Step 3: Implement minimal API error handling**

Add `ApiError`, JSON/text parsing in `throwIfResNotOk`, and `getApiErrorBody`/`getApiErrorMessage` helpers. Update event delete error handling to use the structured body.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test`
Expected: PASS.

### Task 2: Content Draft Cancel

**Files:**
- Modify: `client/src/pages/content.tsx`
- Modify: `scripts/smoke-tests.mjs`

- [ ] **Step 1: Write the failing regression guard**

Add smoke assertions that editing uses a `postDraft`, `startEditingPost`, and `cancelEditingPost`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test`
Expected: FAIL because content editing mutates `posts` directly.

- [ ] **Step 3: Implement draft state**

Keep `posts` as server-backed local list. Store edits in `postDraft`; save commits the draft, cancel discards it, and unsaved new posts are removed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test`
Expected: PASS.

### Task 3: Rich Text Editor Accessibility

**Files:**
- Modify: `client/src/components/RichTextEditor.tsx`
- Modify: `scripts/smoke-tests.mjs`

- [ ] **Step 1: Write the failing regression guard**

Add smoke assertions for `aria-label` and `aria-pressed` on rich text editor toolbar buttons.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test`
Expected: FAIL because the toolbar buttons are icon-only.

- [ ] **Step 3: Add labels and pressed states**

Add translated accessible labels for toolbar actions and `aria-pressed` on formatting toggles.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test`
Expected: PASS.

### Task 4: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run smoke tests**

Run: `npm.cmd test`
Expected: PASS.

- [ ] **Step 2: Run TypeScript check**

Run: `npm.cmd run check`
Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm.cmd run build`
Expected: PASS; known Vite chunk-size warning may remain.
