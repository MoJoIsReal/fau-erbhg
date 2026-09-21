import type { ReactNode } from "react";
import Artwork from "./artwork";
import type { IllustrationSet } from "./illustrations";

type HeroTone = "sand" | "green" | "peach" | "blue";

/**
 * Page identity lives in the hero's tone, and every tone has a dark sibling
 * behind the same token — Kalender stays sage, Dokumenter stays blue/slate,
 * Kontakt stays peach/terracotta in both themes (guide v1.1 §21).
 */
const TONE: Record<HeroTone, string> = {
  sand: "bg-sand",
  green: "bg-green-50",
  peach: "bg-peach",
  blue: "bg-blue-50",
};

export type HeroLayout = "split" | "editorial" | "compact";

export interface PageHeroProps {
  /** Small label above the title — the section a reader is standing in. */
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  /**
   * One short handwritten phrase, at most. Never navigation, never
   * information you would miss if it were missing (guide §3).
   */
  hand?: string;
  actions?: ReactNode;
  /** Extra content under the lead — a next-event line, a filter row. */
  children?: ReactNode;
  illustration?: { art: IllustrationSet; alt: string };
  /**
   * split     — artwork beside the text, bleeding to the container edge
   * editorial — heading over a wide band of artwork
   * compact   — a shallow contextual heading, with or without a thin band
   */
  layout?: HeroLayout;
  tone?: HeroTone;
  /**
   * Render the band at the artwork's own ratio instead of a fixed one, for a
   * crop where nothing may be cut — the values signpost, for instance.
   */
  nativeRatio?: boolean;
  /** The page's own weight. Display is for the site's front door only. */
  titleSize?: "display" | "h1";
  /**
   * Let the hero reach past the reading container on a wide screen. `split`
   * always does; `editorial` and `compact` only when the page asks, because a
   * page that already bleeds its whole body (Kalender) would otherwise pull
   * the margins out twice.
   */
  wide?: boolean;
  /** Only the first hero a visitor meets should preload its artwork. */
  priority?: boolean;
}

/**
 * The opening of a page.
 *
 * Three deliberate variants rather than one template with switches, so pages
 * have personality without drifting apart: `split` gives the home page real
 * artwork beside real text, `editorial` runs a wide band under the heading
 * for pages whose picture is a mood rather than a subject, and `compact` is
 * for pages that mostly want to get out of the way.
 *
 * The heading and the lead are always real HTML. Where the artwork carries
 * lettering of its own it is cropped out, so the picture never becomes the
 * only place a sentence exists (guide v1.1 §23).
 */
export default function PageHero({
  eyebrow,
  title,
  lead,
  hand,
  actions,
  children,
  illustration,
  layout = "compact",
  tone = "sand",
  nativeRatio = false,
  titleSize,
  wide = false,
  priority = false,
}: PageHeroProps) {
  const isSplit = layout === "split";
  const display = (titleSize ?? (isSplit ? "display" : "h1")) === "display";
  const bandRatio = nativeRatio && illustration
    ? { aspectRatio: `${illustration.art.width} / ${illustration.art.height}` }
    : undefined;

  const text = (
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
          {eyebrow}
        </p>
      )}
      <h1
        className={`mt-2.5 font-bold tracking-tight text-ink ${display ? "text-display" : "text-h1"}`}
      >
        {title}
      </h1>
      {lead && <p className="measure mt-5 text-body-lg text-copy">{lead}</p>}
      {hand && (
        <p className="font-hand mt-5 text-2xl text-brand" aria-hidden="true">
          {hand}
        </p>
      )}
      {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
      {children && <div className="mt-7">{children}</div>}
    </div>
  );

  if (isSplit && illustration) {
    return (
      // Wider than the reading container: a hero that stops at 1200px on a
      // 1440px screen reads as a small page in a big window (guide v1.1 §24).
      <section className={`bleed-wide overflow-hidden rounded-hero ${TONE[tone]}`}>
        <div className="grid items-stretch lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)]">
          <div className="px-6 pb-10 pt-10 sm:px-10 sm:pt-14 lg:py-16 lg:pl-14 lg:pr-4">{text}</div>
          {/* The artwork runs to the panel's own edge rather than sitting in
              it with a margin — that gap is what made it read as a thumbnail
              rather than a hero. */}
          <div className="aspect-[16/10] sm:aspect-[2/1] lg:aspect-auto lg:h-full lg:min-h-[420px]">
            <Artwork
              illustration={illustration.art}
              alt={illustration.alt}
              priority={priority}
              sizes="(min-width: 1024px) 46vw, 100vw"
            />
          </div>
        </div>
      </section>
    );
  }

  if (layout === "editorial" && illustration) {
    return (
      <section className={`${wide ? "bleed-wide " : ""}overflow-hidden rounded-hero ${TONE[tone]}`}>
        <div className="px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">{text}</div>
        <div
          className={bandRatio ? "" : "aspect-[16/8] sm:aspect-[16/6] lg:aspect-[16/5]"}
          style={bandRatio}
        >
          <Artwork
            illustration={illustration.art}
            alt={illustration.alt}
            priority={priority}
            sizes="(min-width: 1360px) 1288px, (min-width: 1232px) 1136px, 100vw"
          />
        </div>
      </section>
    );
  }

  return (
    <section className={`${wide ? "bleed-wide " : ""}overflow-hidden rounded-hero ${TONE[tone]}`}>
      <div className="px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">{text}</div>
      {illustration && (
        <div className="aspect-[16/6] sm:aspect-[5/1]">
          <Artwork
            illustration={illustration.art}
            alt={illustration.alt}
            priority={priority}
            sizes="(min-width: 1360px) 1288px, (min-width: 1232px) 1136px, 100vw"
          />
        </div>
      )}
    </section>
  );
}
