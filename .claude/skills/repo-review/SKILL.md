---
name: repo-review
description: System-level audit of a repository covering security, correctness, traceability, performance, maintainability, tests and a11y. Produces REPO_REVIEW.md, REVIEW_TASKS.md and TRACEABILITY_MATRIX.md.
---

# Repository Review

Goal: decide whether the system can be trusted to behave correctly, securely, efficiently and predictably, from the UI through the application layers to the database and back. Finding as many issues as possible is not the goal.
**Read-only:** do not modify production code unless the user explicitly asks.

## Rules
- **Evidence or it isn't a finding.** Cite `path:line`, the symbol, and the route or DB object where relevant, plus the data flow and a realistic failure or attack scenario.
- **Confidence levels:** CONFIRMED · HIGH · POSSIBLE · UNVERIFIED · BLOCKED. Never present an inference as a fact.
- **Search before concluding.** Before calling anything dead, unsafe or wrong, grep repo-wide for its definitions, callers, wrappers, overrides, tests, DB equivalents and convention/DI/reflection use.
- **Don't invent requirements.** Infer intent from code, tests, UI, contracts, schema, config and docs. If intent is still unclear, log it as an ambiguity, not a defect.
- **Priority order:** security > data correctness > broken functionality > reliability > performance > maintainability > tests > a11y > docs. Skip style nits.
- **One root cause, one finding.** List representative evidence and the affected scope rather than N near-duplicates.

## Token discipline (applies to lead and subagents)
- Locate with Glob/Grep first. Read line ranges, not whole files, and don't re-read a file you already have.
- Skip vendored, generated, minified, lock and build-output files. Read manifests only.
- Persist work to `.review/` files instead of carrying it in context. Later phases read those files, not raw source.
- Load a `references/*.md` file only when entering its phase. Pass subagents the path, never the contents.
- Scale to the repo: under ~50 source files or a single app, do everything inline with no subagents. Split by domain only when one agent's scope would exceed about 150 files.

## Phase 1 — Recon → `.review/01-inventory.md` (≤150 lines)
Identify the stack, runtimes, frameworks, DB and data access, API style, auth, build/test/CI/deploy setup, workers, queues, caches, integrations, logging, config and secrets handling.
Sources: root files, solution/project files, manifests, CI, containers, migrations/schema/procs/views/triggers, route tables, entry points.
Use one `Explore` agent (medium) for the sweep if the repo is large.

## Phase 2 — Architecture map → `.review/02-architecture.md` (≤200 lines)
Map what actually exists: boundaries, modules, cross-module and circular dependencies, external systems, trust and data boundaries, state transitions, hidden DB/app side effects.
List the 5–15 most important flows as `UI → handler → client → route → service → data access → DB object`, including return and error paths. Give each flow an ID (F-01…). Specialists work from these IDs.

## Phase 3 — Specialist review (parallel subagents)
Launch independent scopes in a single message. Each agent gets only:
1. its scope (a concern plus paths or flow IDs)
2. the paths `.review/02-architecture.md` and the matching `references/<x>.md`
3. the finding format in `references/output-format.md#finding` and the confidence levels above
4. its output file, `.review/findings-<scope>.md`. It writes the full details there and **returns a summary of at most 15 lines** (counts, top 3 IDs, blocked areas).

| Agent | Scope | Reference |
|---|---|---|
| sec-authz | authN/authZ, object/function-level access, tenant isolation. Trace identity → endpoint → service → resource → data op. UI visibility is not authorization. | security-review.md |
| sec-input | injection/SQL, XSS, CSRF/CORS, SSRF, file handling, business-logic abuse, race/replay | security-review.md |
| sec-platform | secrets, crypto, dependencies, CI/CD, config, error leakage | security-review.md |
| trace | the flows from Phase 2: forward, return and error paths; cross-layer compatibility (names, types, nullability, enums, dates/time zones, precision, defaults, status codes); DB side effects (triggers, cascades, queues, jobs, audit); reverse trace for orphans and dead code | traceability-review.md |
| perf | app/runtime and DB (N+1, round trips, SARGability, implicit conversions, pagination, locking, transaction scope). Separate measured problems, strongly evidenced ones, and ones that need plans or metrics. | performance-review.md |
| quality | architecture/maintainability (show current → problem → proposed → benefit), tests (do they protect core, security, failure and contract paths? coverage % alone doesn't count), observability, docs, WCAG 2.2 AA if there's a UI (static vs runtime vs AT-only) | output-format.md#quality |

Agents must not duplicate each other's scope. Cross-layer items go under "Dependencies" in the finding, not as new findings.

## Phase 4 — Verify
- Run whatever tooling the environment allows: restore, build, lint, typecheck, tests, dependency scan. Log the commands and results in `.review/04-verification.md`. Scanner output is a lead to investigate, not a finding.
- Send every P0 finding and P1 SEC finding to one fresh verifier agent, giving it only the finding text and cited paths. Promote a finding to CONFIRMED only if the verifier reproduces the reasoning.

## Phase 5 — Consolidate
Load `references/output-format.md`. Merge the `.review/findings-*.md` files: dedupe by root cause, assign stable IDs and P0–P3, and build the roadmap. Write:
- `REPO_REVIEW.md` (always)
- `REVIEW_TASKS.md` (always)
- `TRACEABILITY_MATRIX.md` (if there are meaningful UI/API/data flows)
- `ARCHITECTURE_REVIEW.md` (only if existing architecture docs are absent or badly outdated; never overwrite them)

Coverage counts must come from the repo (grep and count). Never estimate them.

## Done when
You can state, with evidence, how inventory → architecture → interactions → code paths → validation → authz → data access → DB side effects → return/error paths hold up for security, correctness, performance and maintainability. Unreviewed areas are listed with a reason and their effect on confidence. Stopping because there are "enough findings" does not count as done.
