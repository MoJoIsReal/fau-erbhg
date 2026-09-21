import type { ReactNode } from "react";
import Artwork from "./artwork";
import type { IllustrationSet } from "./illustrations";

type HeroTone = "sand" | "green" | "peach" | "blue";

const TONE: Record<HeroTone, string> = {
  sand: "bg-sand",
  green: "bg-green-50",
  peach: "bg-peach",
  blue: "bg-blue-50",
};

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
   * split  — artwork beside the text on desktop, under it on mobile
   * strip  — a wide, shallow band of artwork under the text
   * plain  — no artwork; a quiet tinted band
   */
  layout?: "split" | "strip" | "plain";
  tone?: HeroTone;
  /** Only the first hero a visitor meets should preload its artwork. */
  priority?: boolean;
}

/**
 * The opening of a page.
 *
 * Every page uses this component so the header, the title and the first
 * breath of white space are the same everywhere — but the composition is not:
 * the home page gets artwork beside the text, the calendar a wider band, and
 * the document list nothing at all, because a file list does not need a
 * picture to explain itself (guide §12, and the brief's "do not give every
 * page an identical hero").
 *
 * The heading and the lead are always real HTML. Where the artwork carries
 * lettering of its own, it is cropped out or left decorative — it never
 * becomes the only place a sentence exists.
 */
export default function PageHero({
  eyebrow,
  title,
  lead,
  hand,
  actions,
  children,
  illustration,
  layout = "plain",
  tone = "sand",
  priority = false,
}: PageHeroProps) {
  const text = (
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 text-h1 font-bold tracking-tight text-ink">{title}</h1>
      {lead && <p className="measure mt-4 text-body-lg text-copy">{lead}</p>}
      {hand && (
        <p className="font-hand mt-5 text-2xl text-brand" aria-hidden="true">
          {hand}
        </p>
      )}
      {actions && <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );

  if (layout === "split" && illustration) {
    return (
      <section className={`overflow-hidden rounded-hero ${TONE[tone]}`}>
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:gap-12">
          <div className="px-5 pt-8 sm:px-8 sm:pt-10 lg:py-14 lg:pl-12 lg:pr-0">{text}</div>
          {/* Taller than it is wide on a phone would push the text off the
              first screen, so the artwork stays a shallow band there and only
              opens up once there is a column to fill. */}
          <div className="aspect-[16/10] sm:aspect-[2/1] lg:aspect-[4/5] lg:h-full">
            <Artwork
              illustration={illustration.art}
              alt={illustration.alt}
              priority={priority}
              sizes="(min-width: 1024px) 40vw, 100vw"
            />
          </div>
        </div>
      </section>
    );
  }

  if (layout === "strip" && illustration) {
    return (
      <section className={`overflow-hidden rounded-hero ${TONE[tone]}`}>
        <div className="px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">{text}</div>
        <div className="aspect-[16/7] sm:aspect-[3/1] lg:aspect-[4/1]">
          <Artwork
            illustration={illustration.art}
            alt={illustration.alt}
            priority={priority}
            sizes="(min-width: 1200px) 1200px, 100vw"
          />
        </div>
      </section>
    );
  }

  return (
    <section className={`rounded-hero px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12 ${TONE[tone]}`}>
      {text}
    </section>
  );
}
