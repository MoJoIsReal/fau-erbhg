import type { Config } from "tailwindcss";

/**
 * The design system's Tailwind surface.
 *
 * Every value here points at a custom property declared in
 * client/src/index.css, which is the single source of truth for the FAU
 * Erdal Barnehage UI Design & Style Guide. Nothing in this file invents a
 * colour, a radius or a shadow: change the token, and the utility follows in
 * both themes at once.
 *
 * The spacing scale is deliberately left alone — Tailwind's default 4px step
 * already *is* the guide's 8px system (--space-6 === `p-6`), so `gap-6` and
 * `py-16` are token-compliant as they stand.
 */
export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // `font-sans` is the guide's stack, so body copy needs no class.
        sans: ["var(--font-ui)"],
        heading: ["var(--font-ui)"],
        hand: ["var(--font-hand)"],
      },
      /**
       * The type scale from guide §3. Each step interpolates between the
       * guide's mobile and desktop sizes, so one class covers both ends of
       * the range and there are no size-swapping breakpoint classes to keep
       * in sync. Weights stay as explicit utilities — the guide caps a page
       * at three of them (400/600/700).
       */
      fontSize: {
        display: ["clamp(2.625rem, 1.85rem + 2.6vw, 3.5rem)", { lineHeight: "1.08" }],
        h1: ["clamp(2.125rem, 1.79rem + 1.12vw, 2.5rem)", { lineHeight: "1.15" }],
        h2: ["clamp(1.625rem, 1.48rem + 0.5vw, 1.875rem)", { lineHeight: "1.25" }],
        h3: ["clamp(1.25rem, 1.19rem + 0.21vw, 1.375rem)", { lineHeight: "1.32" }],
        h4: ["1.125rem", { lineHeight: "1.4" }],
        "body-lg": ["clamp(1.0625rem, 1.04rem + 0.1vw, 1.125rem)", { lineHeight: "1.55" }],
        body: ["1rem", { lineHeight: "1.6" }],
        small: ["0.875rem", { lineHeight: "1.55" }],
        // v1.1 §24 puts the metadata floor at 13-14px; 12px is kept only
        // for the uppercase eyebrow label, which reads larger than its size.
        micro: ["0.8125rem", { lineHeight: "1.45" }],
        label: ["0.75rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        // shadcn's primitives resolve lg/md/sm off --radius; the guide's own
        // ladder is exposed under its own names so intent stays readable.
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        token: "var(--radius-sm)",
        card: "var(--radius-md)",
        hero: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        panel: "var(--shadow-panel)",
      },
      maxWidth: {
        container: "var(--container)",
        editor: "var(--container-editor)",
        wide: "var(--container-wide)",
        measure: "68ch",
      },
      transitionDuration: {
        micro: "var(--motion-micro)",
        panel: "var(--motion-panel)",
      },
      transitionTimingFunction: {
        guide: "var(--ease-out)",
      },
      colors: {
        // --- shadcn semantic slots, re-anchored on the guide's palette ---
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // --- The guide's named palette (§2), usable directly ---
        brand: {
          DEFAULT: "var(--color-primary)",
          hover: "var(--color-primary-hover)",
          active: "var(--color-primary-active)",
        },
        sage: "var(--color-sage)",
        "green-50": "var(--color-green-50)",
        sand: "var(--color-sand)",
        peach: "var(--color-peach)",
        "blue-50": "var(--color-blue-50)",
        warm: "var(--color-orange)",
        coral: "var(--color-red)",
        ink: "var(--color-ink)",
        // Named `copy` rather than `body` so `text-body` stays unambiguously
        // the 16px/1.6 step of the type scale.
        copy: "var(--color-text)",
        subtle: "var(--color-text-muted)",
        hairline: "var(--color-border)",
        calendar: {
          cell: "var(--color-calendar-cell)",
          hover: "var(--color-calendar-cell-hover)",
          grid: "var(--color-calendar-grid)",
          outside: "var(--color-calendar-outside)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
          soft: "var(--color-surface-soft)",
        },

        // --- Calendar categories (§7). Paired with a label everywhere. ---
        cat: {
          "arrangement-dot": "var(--cat-arrangement-dot)",
          "arrangement-text": "var(--cat-arrangement-text)",
          "arrangement-tint": "var(--cat-arrangement-tint)",
          "mote-dot": "var(--cat-mote-dot)",
          "mote-text": "var(--cat-mote-text)",
          "mote-tint": "var(--cat-mote-tint)",
          "dugnad-dot": "var(--cat-dugnad-dot)",
          "dugnad-text": "var(--cat-dugnad-text)",
          "dugnad-tint": "var(--cat-dugnad-tint)",
          "foto-dot": "var(--cat-foto-dot)",
          "foto-text": "var(--cat-foto-text)",
          "foto-tint": "var(--cat-foto-tint)",
          "internt-dot": "var(--cat-internt-dot)",
          "internt-text": "var(--cat-internt-text)",
          "internt-tint": "var(--cat-internt-tint)",
          "bhgdag-dot": "var(--cat-bhgdag-dot)",
          "bhgdag-text": "var(--cat-bhgdag-text)",
          "bhgdag-tint": "var(--cat-bhgdag-tint)",
          "varmmat-dot": "var(--cat-varmmat-dot)",
          "varmmat-text": "var(--cat-varmmat-text)",
          "varmmat-tint": "var(--cat-varmmat-tint)",
          "temauke-dot": "var(--cat-temauke-dot)",
          "temauke-text": "var(--cat-temauke-text)",
          "temauke-tint": "var(--cat-temauke-tint)",
          "stengt-dot": "var(--cat-stengt-dot)",
          "stengt-text": "var(--cat-stengt-text)",
          "stengt-tint": "var(--cat-stengt-tint)",
          "beskjed-dot": "var(--cat-beskjed-dot)",
          "beskjed-text": "var(--cat-beskjed-text)",
          "beskjed-tint": "var(--cat-beskjed-tint)",
          "info-dot": "var(--cat-info-dot)",
          "info-text": "var(--cat-info-text)",
          "info-tint": "var(--cat-info-tint)",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
