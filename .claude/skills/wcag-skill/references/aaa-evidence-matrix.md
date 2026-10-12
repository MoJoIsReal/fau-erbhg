# WCAG 2.2 AAA evidence matrix

Use this template only when the target is WCAG 2.2 AAA. AAA inherits every
applicable A and AA criterion. Create a row for every applicable A/AA criterion
from the [W3C Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/) and for
every AAA criterion below. “Not applicable” must include a concise rationale.

## Required record format

| SC | Applicable? | Route, state, or asset | Evidence and validation method | Result | Residual risk |
|---|---|---|---|---|---|
| 1.4.6 | Yes | `/checkout`, all breakpoints | Measured all normal-text pairs at ≥7:1; visual review | Pass | None recorded |

Use `Pass`, `Fail`, `Not applicable`, or `Needs human review`. Do not convert a
tool warning into a pass without explaining the decision.

## AAA success criteria

| SC | Criterion | Applicability prompt and required evidence |
|---|---|---|
| 1.2.6 | Sign Language (Prerecorded) | If prerecorded synchronized media exists, document sign-language interpretation or the applicable exception. |
| 1.2.7 | Extended Audio Description (Prerecorded) | If prerecorded video has pauses insufficient for description, document extended audio description. |
| 1.2.8 | Media Alternative (Prerecorded) | If prerecorded synchronized media exists, document a complete media alternative. |
| 1.2.9 | Audio-only (Live) | If live audio-only exists, document its equivalent alternative. |
| 1.4.6 | Contrast (Enhanced) | Measure every normal-text pair at ≥7:1 and large-text pair at ≥4.5:1, including hover, focus, disabled, error, and overlay states. |
| 1.4.7 | Low or No Background Audio | If prerecorded audio has speech, document the audio-control or background-audio exception. |
| 1.4.8 | Visual Presentation | Check user-adjustable presentation requirements, including foreground/background choice, width, line spacing, and resize behaviour where applicable. |
| 1.4.9 | Images of Text (No Exception) | Inventory images of text; replace with real text unless the specified exceptions apply. |
| 2.1.3 | Keyboard (No Exception) | Keyboard-test every function and state; document any functionality that cannot be operated without a keyboard. |
| 2.2.3 | No Timing | Document that time limits are absent or provide the applicable exception. |
| 2.2.4 | Interruptions | Document that interruptions can be postponed or suppressed unless essential. |
| 2.2.5 | Re-authenticating | Re-authenticate a representative session and show that user data is preserved. |
| 2.2.6 | Timeouts | For inactivity timeouts that can lose data, document warning and preservation for more than 20 hours or the applicable exception. |
| 2.3.2 | Three Flashes | Inspect all motion/video/ads; document that no content flashes more than three times in any one-second period. |
| 2.3.3 | Animation from Interactions | Check interaction-triggered motion can be disabled unless essential. |
| 2.4.8 | Location | For a multi-page set, identify the user’s current location through breadcrumbs, navigation, or another mechanism. |
| 2.4.9 | Link Purpose (Link Only) | Review every link in isolation; its accessible name must identify purpose except for the criterion’s exceptions. |
| 2.4.10 | Section Headings | Review long/complex content for descriptive section headings where headings organise content. |
| 2.4.12 | Focus Not Obscured (Enhanced) | Tab through every breakpoint, overlay, sticky region, error state, and menu; no part of the focused component may be hidden by author content. |
| 2.4.13 | Focus Appearance | Measure a focus indicator at least equal to a two-CSS-pixel perimeter of the component and ≥3:1 changed-pixel contrast. |
| 2.5.5 | Target Size (Enhanced) | Measure pointer targets at ≥44×44 CSS px or document the specific exception. |
| 2.5.6 | Concurrent Input Mechanisms | Confirm no author-created restriction disables a supported input mechanism. |
| 3.1.3 | Unusual Words | Identify idioms, jargon, and specialised terms; provide a mechanism for definition when needed. |
| 3.1.4 | Abbreviations | Identify abbreviations whose expanded form is needed for understanding; provide a mechanism for expansion. |
| 3.1.5 | Reading Level | If primary content exceeds lower-secondary reading level, provide supplemental content or an alternative version at that level. |
| 3.1.6 | Pronunciation | Where pronunciation is necessary to understand a word’s meaning, provide a mechanism for it. |
| 3.2.5 | Change on Request | Confirm context changes occur only at user request or document the criterion exception. |
| 3.3.5 | Help | Where context-sensitive help is available, provide it. |
| 3.3.6 | Error Prevention (All) | For legal, financial, test, or data-changing submissions, demonstrate reversibility, review/correction, and confirmation. |
| 3.3.9 | Accessible Authentication (Enhanced) | Test each authentication step; do not require a cognitive-function test unless an allowed alternative or mechanism is available. Do not rely on object recognition or personal content as the enhanced-level exception. |

## Inherited WCAG 2.2 requirements to call out

AAA also requires all applicable A and AA criteria. The AAA table above already
includes 2.4.12 Focus Not Obscured (Enhanced), 2.4.13 Focus Appearance, and
3.3.9 Accessible Authentication (Enhanced) — do not duplicate rows for those.
Explicitly verify the remaining WCAG 2.2 additions that are A/AA level: 2.4.11
Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size
(Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant Entry, and 3.3.8 Accessible
Authentication (Minimum). Consult the W3C Quick Reference for the full
inherited set.
