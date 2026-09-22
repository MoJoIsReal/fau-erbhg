import type { CSSProperties, ReactNode } from "react";
import Artwork from "./artwork";
import type { IllustrationSet } from "./illustrations";

type HeroTone = "sand" | "green" | "peach" | "blue";

/**
 * Page identity lives in the hero's tone, and every tone has a dark sibling
 * behind the same token — Kalender stays sage, Dokumenter stays blue/slate,
 * Kontakt stays peach/terracotta in both themes (guide v1.1 §21).
 */
const TONE: Record<HeroTone, string> = {
  // Sand is the page itself, so the front-door pages get no panel at all
  // — in either theme. A panel that only exists after dark would inset the
  // heading away from a band that runs flush, which is the misalignment
  // `panel` below is about.
  sand: "bg-transparent",
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
   * compact   — a shallow contextual heading, with or without a band
   */
  layout?: HeroLayout;
  tone?: HeroTone;
  /** The page's own weight. Display is for the site's front door only. */
  titleSize?: "display" | "h1";
  /**
   * Let the hero reach past the reading container on a wide screen. Only
   * ever when a page asks, and only when the page bleeds with it — a hero
   * that reaches past sections that do not just looks wider than them. No
   * page asks today: Kalender bleeds its whole body instead, and passing
   * this there would pull the margins out twice.
   */
  wide?: boolean;
  /** Only the first hero a visitor meets should preload its artwork. */
  priority?: boolean;
}

/**
 * The opening of a page.
 *
 * Three deliberate variants rather than one template with switches, so pages
 * have personality without drifting apart: `split` gives a page real artwork
 * beside real text and takes its height from the picture, `editorial` runs an
 * illustrated band under the heading, and `compact` is for pages that mostly
 * want to get out of the way.
 *
 * The illustration is never wallpaper behind the words and never a thumbnail
 * beside them: it holds a whole column or a whole band, cut for that frame in
 * `illustrations.ts` and swapped for its night drawing in the dark theme. The
 * heading and the lead stay real HTML — where the artwork carries lettering
 * of its own the crop either clears it or keeps a phrase the page never says
 * itself, so the picture is never the only place a sentence exists (guide
 * v1.1 §23).
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
  titleSize,
  wide = false,
  priority = false,
}: PageHeroProps) {
  const isSplit = layout === "split";
  const display = (titleSize ?? (isSplit ? "display" : "h1")) === "display";
  /**
   * Sand heroes have no panel, so they have nothing to inset against: their
   * heading lines up with the band or the artwork beside it and with every
   * section under it. Without this the title on Aktuelt sat 56px inside a
   * band that ran flush to the container, which reads as a mistake rather
   * than as a margin.
   */
  const panel = tone !== "sand";
  const textPad = panel
    ? "px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14"
    : "pb-9 sm:pb-10 lg:pb-12";

  /**
   * Both frames follow the crops: `--art-wide` is the desktop rectangle's
   * ratio and `--art-narrow` the phone one's, which is what lets a phone show
   * the narrow crop entire instead of cropping an already-cropped picture.
   */
  const frame = illustration
    ? ({
        "--art-wide": illustration.art.ratio.wide,
        "--art-narrow": illustration.art.ratio.narrow,
        // Between the two, a split column is 16:9 unless the crop is wider
        // than that — showing a 2:1 crop in a 16:9 frame costs 14% of its
        // width, and on Dokumenter that is the T of ENGASJEMENT.
        "--art-mid": Math.max(16 / 9, illustration.art.ratio.wide),
      } as CSSProperties)
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
      // The hero holds the reading container like every other section of the
      // page. It used to reach 76px past it on a wide screen, and because a
      // sand hero has no panel the only thing that showed for it was the
      // artwork sticking out to the right of the cards below — a bleed you
      // could only see on one side reads as a misalignment, not as a hero.
      <section className={`overflow-hidden rounded-hero ${TONE[tone]}`}>
        {/* Two columns only from 1280px, and the artwork takes the larger of
            them: ~650px of picture against ~485px of text, which is the
            difference between an illustration that opens the page and one
            that decorates it. Between 1024 and 1280 the text is tall enough
            that a column beside it would be framed portrait, and object-cover
            would then crop a landscape crop sideways — straight through the
            value signpost. */}
        <div className="grid items-stretch xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {/* Stacked, the artwork goes first: a phone otherwise opens on a
              screenful of heading and lead with the illustration entirely
              below the fold, which is the opposite of what it is for. The
              heading still comes first in the DOM, so the reading order and
              the document outline are unchanged. */}
          <div
            className={`order-2 pb-10 pt-8 sm:pb-12 sm:pt-10 xl:order-1 xl:py-14 xl:pr-8 ${
              panel ? "px-6 sm:px-10 xl:pl-14" : "xl:pl-0"
            }`}
          >
            {text}
          </div>
          {/* The artwork runs to the panel's own edge rather than sitting in
              it with a margin — that gap is what made it read as a thumbnail
              rather than a hero. The frame's own rules live with
              `.art-frame` in index.css. */}
          <div className="art-frame order-1 xl:order-2" style={frame}>
            <Artwork
              illustration={illustration.art}
              alt={illustration.alt}
              priority={priority}
              sizes="(min-width: 1360px) 721px, (min-width: 1280px) 50vw, 100vw"
            />
          </div>
        </div>
      </section>
    );
  }

  const band = illustration && (
    <div className="hero-band" style={frame}>
      <Artwork
        illustration={illustration.art}
        alt={illustration.alt}
        priority={priority}
        sizes="(min-width: 1360px) 1288px, (min-width: 1232px) 1136px, 100vw"
      />
    </div>
  );

  if (layout === "editorial" && illustration) {
    return (
      <section className={`${wide ? "bleed-wide " : ""}overflow-hidden rounded-hero ${TONE[tone]}`}>
        <div className={textPad}>{text}</div>
        {band}
      </section>
    );
  }

  return (
    <section className={`${wide ? "bleed-wide " : ""}overflow-hidden rounded-hero ${TONE[tone]}`}>
      <div className={panel ? "px-6 py-9 sm:px-10 sm:py-10 lg:px-14 lg:py-12" : "pb-8 lg:pb-10"}>
        {text}
      </div>
      {band}
    </section>
  );
}
