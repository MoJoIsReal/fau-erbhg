---
name: wcag-skill
description: "Build, audit, and repair web content against WCAG 2.2. Use when: (1) creating accessible HTML/CSS/JS, (2) remediating accessibility defects, (3) running reproducible automated audits, (4) preparing WCAG 2.2 AAA evidence and human-test records, or (5) running the optional AI-WCAG-Gauntlet benchmark."
metadata:
  version: 2.0.12
  openclaw:
    requires:
      bins:
        - node
        - npm
        - python3
        - curl
        - java
    envVars:
      - name: AXE_CHROME_PATH
        required: false
        description: Explicit Chrome/Chromium binary path for scripts/a11y-audit.sh when auto-detection fails.
      - name: AXE_CHROMEDRIVER_PATH
        required: false
        description: Explicit Chromedriver binary path for scripts/a11y-audit.sh when auto-detection fails.
    install:
      - kind: node
        package: "@axe-core/cli"
        bins: [axe]
      - kind: node
        package: pa11y
        bins: [pa11y]
      - kind: node
        package: "@qualweb/cli"
        bins: [qw]
      - kind: node
        package: vnu-jar
        bins: [vnu]
      - kind: node
        package: chromedriver
        bins: [chromedriver]
    homepage: https://github.com/turbolego/wcag-skill
---

# WCAG 2.2 Accessibility

Use this skill to build or audit web content. Prefer native HTML, test through
HTTP, and treat automated output as evidence—not proof of conformance.

## Choose the scope first

1. Inventory every route, breakpoint, interactive state, overlay, error path,
   media item, authentication step, and third-party component in scope.
2. Set the target: `baseline`, `AA`, or `AAA`.
3. For an AAA target, read **all three** references before implementation:
   - [`references/validator-workflow.md`](references/validator-workflow.md)
   - [`references/aaa-evidence-matrix.md`](references/aaa-evidence-matrix.md)
   - [`references/manual-test-protocol.md`](references/manual-test-protocol.md)

> Do not say “WCAG AAA compliant” from automated results. Level AAA requires
> every applicable A, AA, and AAA success criterion for the full page and any
> complete process. Record an explicit evidence row or non-applicability
> rationale for each criterion.

## Build accessible by default

- Use one `<main>`, a meaningful `<title>`, one clear `<h1>`, and landmarks
  only where their semantics help orientation. Use `<section>` for a meaningful
  thematic grouping; give it an accessible heading when that improves its name.
  Use `<div>` for visual grouping alone.
- Use real `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, and native
  disclosure/dialog patterns before inventing ARIA widgets. Never put a
  focusable element inside `aria-hidden="true"` content.
- Give informative images equivalent text; use `alt=""` only for decorative
  images. Provide the relevant captions, transcript, audio description, or
  media alternative for media.
- Label every form control, group related controls with `<fieldset><legend>`,
  use appropriate input types and `autocomplete`, preserve entered data after
  recoverable errors, and identify errors in text as well as colour.
- Keep DOM order aligned with reading and Tab order. Provide a skip link,
  visible focus, keyboard operation, and no keyboard trap.
- Do not communicate status, errors, required fields, or instructions by colour,
  position, shape, or sound alone. Respect `prefers-reduced-motion`.
- Ensure pointer targets are at least 24×24 CSS px (AA) or 44×44 CSS px (AAA) unless an exception applies.
- Ensure dragging movements can be operated with a single pointer without dragging (AA, unless dragging is essential) and provide alternatives or cancellation; timing limits on dragging are covered by separate timing criteria.
- Make sure the keyboard focus indicator is visible and has sufficient contrast (AA, WCAG 2.2 SC 2.4.11 Focus Appearance: at least 2 CSS px perimeter and 3:1 contrast).

## Low-memory audit guardrail (script-level)

When running on hosts with <2 GB RAM or in containers, use `scripts/a11y-audit-limited.sh`. Never delete this script (see PR #12 rejection rule below).
It reads memory from `/proc/meminfo` (MemAvailable first), falls back to `free -m` (6th column = available memory in MB), then prefers the cgroup limit (`memory.limit_in_bytes` v1 or `memory.max` v2). It ignores the v1 unlimited sentinel (`9223372036854775807`) and caps unreasonably large values. Memory limits (ulimit -v and NODE_OPTIONS) are configurable via `ULIMIT_PERCENT`/`ULIMIT_MIN_MB` and `NODE_PERCENT`/`NODE_MIN_MB` environment variables with sensible defaults, and always capped to the available budget (never exceed it). If `ulimit -v` fails, the wrapper exits with an explicit error rather than swallowing it.

In extremely constrained environments (<512MB available), you may need to explicitly set `NODE_OPTIONS="--max-old-space-size=256"` before running the audit wrapper.

Pitfall: never rely on host `/proc/meminfo` inside a container — verify the container's cgroup quota (v1 `memory.limit_in_bytes`, v2 `memory.max`) matches the guardrail; the wrapper checks cgroup first but host and container budgets can diverge.

Pitfall: the v2 cgroup branch (`memory.max`) must be `if`, not `elif`, or a v2-only container skips the limit. Never delete `scripts/a11y-audit-limited.sh` (PR #12 guard). If `ulimit -v` fails, exit with an explicit error — do not swallow it.
Pitfall: vnu requires Java 17+; using older Java causes `UnsupportedClassVersionError`. In CI, set `JAVA_HOME` to a Java 17+ installation and add `_JAVA_OPTIONS="-Xmx256m -Xshare:off -Djava.io.tmpdir=/tmp"` to redirect temp storage to disk and avoid shared-memory exhaustion.

- See also [`references/pil-logo-grid.md`](references/pil-logo-grid.md) for the PIL circular-logo layout pattern used when updating grid images.

## CI workflow maintenance

Keep GitHub Actions workflows (`.github/workflows/*.yml`) in sync with the pinned tool versions in `package.json`.
When the Chrome version on the runner changes, the `Align chromedriver to the installed Chrome major version` step must use a reliable version extraction: `chrome_major=$(/opt/hostedtoolcache/setup-chrome/chromium/stable/x64/chrome --version 2>/dev/null | grep -oE '[0-9]+' | head -1)`.
This prevents `npm error ETARGET` when requesting a non‑existent chromedriver version.

Periodically run `npm ci` in a clean environment to verify that the pinned dependencies install without errors on the target Node version (>=22).
If you encounter heap-limit errors, increase the Node old space via `NODE_OPTIONS` (e.g., `NODE_OPTIONS="--max-old-space-size=512"`) before running `npm ci`.

## CI / audit environment notes

- `vnu-jar` requires Java 17 or newer; CI runners with older Java will throw `UnsupportedClassVersionError`. Set `JAVA_HOME` to a Java 17+ installation when needed.
- `vnu` writes temporary files to `/dev/shm`. On CI runners with small shared-memory partitions, add `_JAVA_OPTIONS="-Xshare:off -Djava.io.tmpdir=/tmp -Xmx256m"` to redirect temp storage to disk and cap heap.
- The audit wrapper (`scripts/a11y-audit-limited.sh`) reads container memory via `memory.limit_in_bytes` (v1) and `memory.max` (v2). The v2 branch must remain independent (`if`, not `elif`) so both limits are checked in environments where both files exist. When v1 returns a valid (non-sentinel, non-excessive) limit, use it; fall back to v2 only when v1 is unreadable or yields an invalid value.
- The `scripts/run-w3c-validator.mjs` script must be able to parse vnu output that may include warning messages; it now combines stdout and stderr and extracts a JSON object if necessary.


## Use the right numeric target

| Requirement | Baseline / AA minimum | AAA target |
|---|---:|---:|
| Normal text contrast | 4.5:1 | 7:1 |
| Large text contrast | 3:1 | 4.5:1 |
| UI component / focus contrast | 3:1 (AA; includes the 2.4.11 focus-appearance perimeter/contrast rule) | 3:1 |
| Pointer target | 24×24 CSS px | 44×44 CSS px unless a documented exception applies |
| Dragging movements | AA (WCAG 2.2) | AAA requires pointer target ≥44×44 CSS px (time limits covered by separate timing criteria) |

For AA (WCAG 2.2 SC 2.4.11 Focus Appearance), make the keyboard focus indicator
at least as large as a two-CSS-pixel perimeter of the unfocused component and
give changed pixels at least 3:1 contrast. Ensure no part of a focused
component is obscured by author-created content.

## Audit → triage → fix → verify


1. Install the tools listed in the frontmatter and make Chrome/Chromium plus a
   matching Chromedriver available. Set `AXE_CHROME_PATH` and
   `AXE_CHROMEDRIVER_PATH` when auto-detection is insufficient.
   In low-memory environments (e.g., <2GB RAM), consider using the headless
   shell and limiting memory via `NODE_OPTIONS` and `ulimit -v`; see
   `scripts/a11y-audit-limited.sh` for an example.

2. Serve the site over HTTP. Run the reproducible wrapper in
   [`references/validator-workflow.md`](references/validator-workflow.md).

3. Triage structural and markup errors first, then semantic, visual, operable,
   and understandable issues. Deduplicate findings across tools; retain raw
   JSON reports.

4. Fix one coherent group of issues, rerun the audit, and record the result.
   Review every `incomplete`, `cantTell`, warning, and false-positive decision.

5. For AAA, complete the mandatory manual protocol and evidence matrix before
   any conformance statement.

## Report precisely

For each finding, report the route/state, relevant success criterion, affected
selector or component, user impact, exact change, validation method, and retest
result. Say “no automated findings” when that is all the tools establish.

## Optional benchmark extension

The AI-WCAG-Gauntlet tag-coverage experiment is **not** a production
accessibility gate. Use it only when the task explicitly requests benchmark
scoring. Read [`benchmark/README.md`](benchmark/README.md) then; never copy its
reference template into a benchmark submission.
