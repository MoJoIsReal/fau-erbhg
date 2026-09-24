# Output Format

## finding
Specialists write each finding to `.review/findings-<scope>.md` in this format. Keep each one to about 25 lines.
```
### <TMP-ID> <title>
Area: SEC|TRACE|PERF|DB|MAINT|ARCH|A11Y|TEST|DOC|OBS · Severity: Critical|High|Medium|Low · Confidence: CONFIRMED|HIGH|POSSIBLE|UNVERIFIED|BLOCKED · Verified: static|build|unit|integration|runtime|db|reasoned
Where: `path:line` symbol / route / DB object
Evidence: <code facts, flow, caller→callee>
Cause → Impact: <root cause> → <realistic scenario>
Fix: <change> · Test: <how to prove it> · Regression risk: <what can break>
Scope: <other locations sharing this root cause, if systemic>
Dependencies: <other findings/layers>
Tests touching this: <paths or "none">
```
Also end the file with `## Blocked/unverified`, `## Positive findings` (verified strengths only) and `## Ambiguities`.

## quality
- **Maintainability:** duplication, dead code, complexity, hidden state/side effects, coupling, cycles, type safety, terminology/contract drift, inconsistent error handling, config drift, date/null semantics, migration risk. Apply SOLID and patterns only where there is a demonstrated benefit.
- **Tests:** do they protect core paths, authz, failure paths, integrations, DB behavior and contracts?
- **Observability:** structured logs, levels, correlation/tracing, health checks, metrics, audit logging, sensitive data in logs. Would a production failure be diagnosable?
- **A11y (WCAG 2.2 AA):** semantics, keyboard, focus, names, forms/errors, dialogs, ARIA, contrast, reflow, live announcements, 2.2 additions (focus not obscured, target size, redundant entry, accessible auth).

## IDs and priority
Stable IDs: `SEC-001`, `TRACE-`, `PERF-`, `DB-`, `MAINT-`, `ARCH-`, `A11Y-`, `TEST-`, `DOC-`, `OBS-`.
- **P0:** critical security, data corruption, auth bypass, severe production failure
- **P1:** high-severity vulnerability, broken core flow, major reliability/performance issue or architecture risk
- **P2:** medium defects, meaningful debt
- **P3:** cleanup, docs, incremental quality

## REPO_REVIEW.md
1. Executive summary
2. Architecture overview
3. Coverage (real counts: components, entry points, endpoints, service methods, data-access methods, DB objects, traces complete/partial/blocked)
4. Scorecard
5. Prioritized findings (table: ID · P · Sev · Conf · title · location)
6. Security
7. Traceability
8. Performance/DB
9. Architecture/maintainability
10. Accessibility (if UI)
11. Testing/observability
12. Documentation
13. Positive findings
14. Roadmap
15. Blocked/unverified (each item with its effect on confidence)
16. Verdict

**Scorecard:** give a 1–10 score with a one-line evidence-based justification for Security, Performance, Maintainability, Architecture, Code quality, Testability, Traceability, Accessibility, Observability, Documentation and Overall. Overall is a judgment call, not an average.

**Roadmap:**
- Phase 1: stop-the-line (security, correctness)
- Phase 2: functional integrity
- Phase 3: reliability and performance
- Phase 4: maintainability
- Phase 5: tests, a11y, docs, developer experience

Note the dependencies between phases.

**Verdict:** one line each on
- Security: can it be trusted?
- Correctness: do the primary flows hold end to end?
- Performance: are there material scaling concerns?
- Maintainability: can engineers change it safely?
- Testability: would regressions be caught?
- Operational confidence: how safe is deploying and changing it?
- Technical debt: localized, moderate, systemic or architectural?

Then pick one overall rating: Healthy · Healthy with minor remediation · Requires targeted remediation · Requires significant remediation · High-risk / remediation required before substantial feature work.

## REVIEW_TASKS.md
Write one atomic, testable, non-duplicative task per actionable finding (or systemic root cause):
```
## [ ] SEC-001 — <title>
**Priority:** P0 · **Severity:** Critical · **Confidence:** High · **Effort:** S|M|L · **Area:** Security / Authorization
### Files
### Problem
### Evidence
### Required change
### Acceptance criteria
- [ ] ...
### Verification
### Dependencies
### Related findings
```
End with a dependency graph and a list of the tasks that can run in parallel.

## TRACEABILITY_MATRIX.md
Columns: Trace ID · Feature · UI location · UI handler · Client fn · Endpoint · Controller · Service · Data access · DB object · Input sig · Output sig · AuthZ · Validation · Error path · Return mapping · Status · Findings.
Status: PASS | FAIL | PARTIAL | UNVERIFIED | DEAD | ORPHANED. For every FAIL, name the exact broken link.
