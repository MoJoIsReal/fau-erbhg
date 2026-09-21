import heroHome782 from "@/assets/illustrations/hero-home-782.webp";
import heroHome1120 from "@/assets/illustrations/hero-home-1120.webp";
import heroHome782Jpg from "@/assets/illustrations/hero-home-782.jpg";
import heroHome1120Jpg from "@/assets/illustrations/hero-home-1120.jpg";
import bannerValues620 from "@/assets/illustrations/banner-values-620.webp";
import bannerValues960 from "@/assets/illustrations/banner-values-960.webp";
import bannerValues620Jpg from "@/assets/illustrations/banner-values-620.jpg";
import bannerValues960Jpg from "@/assets/illustrations/banner-values-960.jpg";
import heroCalendar840 from "@/assets/illustrations/hero-calendar-840.webp";
import heroCalendar1400 from "@/assets/illustrations/hero-calendar-1400.webp";
import heroCalendar840Jpg from "@/assets/illustrations/hero-calendar-840.jpg";
import heroCalendar1400Jpg from "@/assets/illustrations/hero-calendar-1400.jpg";
import heroNews840 from "@/assets/illustrations/hero-news-840.webp";
import heroNews1400 from "@/assets/illustrations/hero-news-1400.webp";
import heroNews840Jpg from "@/assets/illustrations/hero-news-840.jpg";
import heroNews1400Jpg from "@/assets/illustrations/hero-news-1400.jpg";
import heroDocuments840 from "@/assets/illustrations/hero-documents-840.webp";
import heroDocuments1400 from "@/assets/illustrations/hero-documents-1400.webp";
import heroDocuments840Jpg from "@/assets/illustrations/hero-documents-840.jpg";
import heroDocuments1400Jpg from "@/assets/illustrations/hero-documents-1400.jpg";
import heroContact840 from "@/assets/illustrations/hero-contact-840.webp";
import heroContact1400 from "@/assets/illustrations/hero-contact-1400.webp";
import heroContact840Jpg from "@/assets/illustrations/hero-contact-840.jpg";
import heroContact1400Jpg from "@/assets/illustrations/hero-contact-1400.jpg";

/**
 * The illustration library.
 *
 * Every page now has artwork drawn for it. The six commissioned originals
 * live in `attached_assets/illustrations/` as ~2.4MB PNGs; what ships is the
 * webp/jpg pair derived from each here, because `client/public/` is copied
 * verbatim into the deploy and 14MB of unresized PNG would have been served
 * to phones. Regenerate with the crop constants below if an original is
 * ever replaced.
 *
 * Two rules govern every crop:
 *
 * 1. **The values are the official ones.** Wherever a signpost appears it
 *    reads FOR BARNA / SAMMEN / ENGASJEMENT, complete — never two of the
 *    three, which is why the Dokumenter band keeps its full height rather
 *    than cropping to a slimmer strip that would cut "FOR BARNA" off the
 *    top plank.
 * 2. **A crop may keep the artwork's own handwritten aside; it may never
 *    keep lettering that repeats the page's own heading, or a line the page
 *    already prints as HTML.** So the home crop drops "Velkommen til FAU
 *    Erdal Barnehage" (the page's h1), Aktuelt drops the noticeboard's
 *    "AKTUELT" plank (the same), and Kalender drops "Små mennesker, store
 *    dager" because the calendar hero prints that tagline itself. Dokumenter
 *    keeps "Nyttig og oversiktlig" and Kontakt keeps "Ta gjerne kontakt":
 *    neither sentence exists anywhere else on its page, so nothing is being
 *    said only in pixels.
 *
 * `focus` is the object-position used when the frame is narrower than the
 * artwork: it names what must survive the crop — children, signs, the
 * mailbox — rather than defaulting to the centre.
 */
export interface Illustration {
  webp: string;
  jpg: string;
  /** Intrinsic width/height of the source crop, to reserve layout space. */
  width: number;
  height: number;
  /** object-position for narrow frames. */
  focus: string;
}

function set(
  small: string,
  large: string,
  smallJpg: string,
  largeJpg: string,
  smallWidth: number,
  largeWidth: number,
  width: number,
  height: number,
  focus: string,
): Illustration & { srcSet: string; jpgSrcSet: string } {
  return {
    webp: large,
    jpg: largeJpg,
    srcSet: `${small} ${smallWidth}w, ${large} ${largeWidth}w`,
    jpgSrcSet: `${smallJpg} ${smallWidth}w, ${largeJpg} ${largeWidth}w`,
    width,
    height,
    focus,
  };
}

/**
 * Two children walking hand in hand toward the FOR BARNA / SAMMEN /
 * ENGASJEMENT signpost. The home page's hero.
 *
 * From home-welcome-values at (890, 384, 782×557). The original sets
 * "Velkommen til FAU Erdal Barnehage" across its sky, and the page's own h1
 * says exactly that — but the headline runs to x=1023 while the boy starts
 * at x=913, so no full-width band holds the children and the sign without
 * it. Taking the right-hand block instead clears the headline (its last
 * descender ends at y=381) and keeps both children, the whole signpost and
 * the bird. That leaves a 1.4:1 crop, which is why the home hero is the
 * `split` variant: artwork in a full-height column beside real text, rather
 * than a wide band it would have to be cut to fit.
 */
export const ILLUSTRATION_HOME = set(
  heroHome782,
  // 782px is every pixel the crop has. The second step is a lanczos upscale
  // for 2x screens — flat illustration colour takes it well, and it beats
  // letting the browser stretch the smaller file across the column.
  heroHome1120,
  heroHome782Jpg,
  heroHome1120Jpg,
  782,
  1120,
  782,
  557,
  // Anchored high: the only frame that crops this crop is the stacked 16:9
  // one, and what must survive it is the signpost and the children's faces,
  // not their boots.
  "50% 20%",
);

/**
 * Two children on a rock below the same signpost, pointing out over the
 * fjord. The home page's closing "bli med"-band.
 *
 * home-values-signpost carries no prose at all — the only words in it are
 * the three official values — so it is used whole.
 */
export const ILLUSTRATION_VALUES = set(
  bannerValues620,
  bannerValues960,
  bannerValues620Jpg,
  bannerValues960Jpg,
  620,
  960,
  1672,
  941,
  "55% 55%",
);

/**
 * Two children on a log over the fjord at golden hour. Calendar hero.
 *
 * From calendar-children-fjord at (0, 328, 1672×613). The original writes
 * "Små mennesker, store dager" across its sky and the calendar hero already
 * prints that tagline in HTML directly above the band, so the crop starts
 * below the ink (which ends at y=324) and above the sun (y=333).
 */
export const ILLUSTRATION_CALENDAR = set(
  heroCalendar840,
  heroCalendar1400,
  heroCalendar840Jpg,
  heroCalendar1400Jpg,
  840,
  1400,
  1672,
  613,
  "58% 55%",
);

/**
 * Four children running toward the kindergarten's noticeboard, with the
 * signpost beside it. Aktuelt hero.
 *
 * From aktuelt-community at (0, 390, 1672×551). The board's header plank
 * reads "AKTUELT", which is the page's own h1, so the crop starts under it
 * — keeping the board itself, its pinned notes and the signpost.
 */
export const ILLUSTRATION_NEWS = set(
  heroNews840,
  heroNews1400,
  heroNews840Jpg,
  heroNews1400Jpg,
  840,
  1400,
  1672,
  551,
  "50% 50%",
);

/**
 * Papers, a notebook and a binder on a table above the fjord. Dokumenter
 * hero.
 *
 * From documents-information at (0, 130, 1672×811) — the leafy branches
 * across the top are trimmed, and everything else stays. "Nyttig og
 * oversiktlig" is the artwork's own aside and is kept: cropping it away
 * would also cut "FOR BARNA" off the signpost, since the two overlap
 * vertically (handwriting y=154–293, top plank from y≈214).
 */
export const ILLUSTRATION_DOCUMENTS = set(
  heroDocuments840,
  heroDocuments1400,
  heroDocuments840Jpg,
  heroDocuments1400Jpg,
  840,
  1400,
  1672,
  811,
  "50% 60%",
);

/**
 * A red postbox, a robin with an envelope, and a parent and child waving at
 * the kindergarten gate. Kontakt hero.
 *
 * contact-mailbox is used whole: "Ta gjerne kontakt" is the artwork's own
 * handwritten aside, the page's heading is "Kontakt oss", and cropping the
 * phrase away would take the robin and the envelope with it — which is the
 * one motif that makes this a contact illustration rather than a landscape.
 */
export const ILLUSTRATION_CONTACT = set(
  heroContact840,
  heroContact1400,
  heroContact840Jpg,
  heroContact1400Jpg,
  840,
  1400,
  1916,
  821,
  "60% 55%",
);

export type IllustrationSet = ReturnType<typeof set>;
