# client/ — read the style guide before visual changes

Everything under `client/` is the visual layer of the site. Before changing how
anything looks — a component, page layout, colour, spacing, type, illustration,
icon, motion or the dark theme — read the relevant sections of
[`../docs/design/style-guide.md`](../docs/design/style-guide.md) (the *FAU Erdal
Barnehage UI Design & Style Guide 1.1*). It opens with a guide → repo mapping
and a checklist; follow the guide rather than the look of nearby code.

In short: tokens from `src/index.css` only (no hex, one-off radius, shadow or
font size in a component), `src/components/site/` before new markup, works in
both themes by swapping tokens, 4.5:1 text contrast, 3px focus ring, 44px touch
targets, never colour alone, and checked at 375–1440px. The repository-wide
rules are in [`../AGENTS.md`](../AGENTS.md) under "The design system".
