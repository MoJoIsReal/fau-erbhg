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
import heroHomeDark782 from "@/assets/illustrations/hero-home-dark-782.webp";
import heroHomeDark1120 from "@/assets/illustrations/hero-home-dark-1120.webp";
import heroHomeDark782Jpg from "@/assets/illustrations/hero-home-dark-782.jpg";
import heroHomeDark1120Jpg from "@/assets/illustrations/hero-home-dark-1120.jpg";
import bannerValuesDark620 from "@/assets/illustrations/banner-values-dark-620.webp";
import bannerValuesDark960 from "@/assets/illustrations/banner-values-dark-960.webp";
import bannerValuesDark620Jpg from "@/assets/illustrations/banner-values-dark-620.jpg";
import bannerValuesDark960Jpg from "@/assets/illustrations/banner-values-dark-960.jpg";
import heroCalendarDark840 from "@/assets/illustrations/hero-calendar-dark-840.webp";
import heroCalendarDark1400 from "@/assets/illustrations/hero-calendar-dark-1400.webp";
import heroCalendarDark840Jpg from "@/assets/illustrations/hero-calendar-dark-840.jpg";
import heroCalendarDark1400Jpg from "@/assets/illustrations/hero-calendar-dark-1400.jpg";
import heroNewsDark840 from "@/assets/illustrations/hero-news-dark-840.webp";
import heroNewsDark1400 from "@/assets/illustrations/hero-news-dark-1400.webp";
import heroNewsDark840Jpg from "@/assets/illustrations/hero-news-dark-840.jpg";
import heroNewsDark1400Jpg from "@/assets/illustrations/hero-news-dark-1400.jpg";
import heroDocumentsDark840 from "@/assets/illustrations/hero-documents-dark-840.webp";
import heroDocumentsDark1400 from "@/assets/illustrations/hero-documents-dark-1400.webp";
import heroDocumentsDark840Jpg from "@/assets/illustrations/hero-documents-dark-840.jpg";
import heroDocumentsDark1400Jpg from "@/assets/illustrations/hero-documents-dark-1400.jpg";
import heroContactDark840 from "@/assets/illustrations/hero-contact-dark-840.webp";
import heroContactDark1400 from "@/assets/illustrations/hero-contact-dark-1400.webp";
import heroContactDark840Jpg from "@/assets/illustrations/hero-contact-dark-840.jpg";
import heroContactDark1400Jpg from "@/assets/illustrations/hero-contact-dark-1400.jpg";

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
 *
 * Every illustration has a night sibling, drawn as the same scene after dark
 * and stored beside the original as `<name>-dark.png`. Dark mode is a
 * re-anchored theme rather than a dimmed one, and a daylight photograph in it
 * is the one thing tokens cannot fix, so `Artwork` serves the night file
 * whenever the dark theme is on. The crops are the light ones, rectangle for
 * rectangle, because the scenes are drawn to the same geometry — Kontakt is
 * the exception, and says why below.
 */
export interface Illustration {
  webp: string;
  jpg: string;
  srcSet: string;
  jpgSrcSet: string;
  /** Intrinsic width/height of the source crop, to reserve layout space. */
  width: number;
  height: number;
  /** object-position for narrow frames. */
  focus: string;
}

/**
 * The night sibling's four files, and the three numbers that only a night
 * crop of different proportions needs to restate.
 */
interface DarkSources {
  small: string;
  large: string;
  smallJpg: string;
  largeJpg: string;
  width?: number;
  height?: number;
  focus?: string;
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
  dark: DarkSources,
): Illustration & { dark: Illustration } {
  return {
    webp: large,
    jpg: largeJpg,
    srcSet: `${small} ${smallWidth}w, ${large} ${largeWidth}w`,
    jpgSrcSet: `${smallJpg} ${smallWidth}w, ${largeJpg} ${largeWidth}w`,
    width,
    height,
    focus,
    dark: {
      webp: dark.large,
      jpg: dark.largeJpg,
      srcSet: `${dark.small} ${smallWidth}w, ${dark.large} ${largeWidth}w`,
      jpgSrcSet: `${dark.smallJpg} ${smallWidth}w, ${dark.largeJpg} ${largeWidth}w`,
      width: dark.width ?? width,
      height: dark.height ?? height,
      focus: dark.focus ?? focus,
    },
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
  {
    small: heroHomeDark782,
    large: heroHomeDark1120,
    smallJpg: heroHomeDark782Jpg,
    largeJpg: heroHomeDark1120Jpg,
  },
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
  {
    small: bannerValuesDark620,
    large: bannerValuesDark960,
    smallJpg: bannerValuesDark620Jpg,
    largeJpg: bannerValuesDark960Jpg,
  },
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
  {
    small: heroCalendarDark840,
    large: heroCalendarDark1400,
    smallJpg: heroCalendarDark840Jpg,
    largeJpg: heroCalendarDark1400Jpg,
  },
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
  {
    small: heroNewsDark840,
    large: heroNewsDark1400,
    smallJpg: heroNewsDark840Jpg,
    largeJpg: heroNewsDark1400Jpg,
  },
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
  {
    small: heroDocumentsDark840,
    large: heroDocumentsDark1400,
    smallJpg: heroDocumentsDark840Jpg,
    largeJpg: heroDocumentsDark1400Jpg,
  },
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
  // The night scene is a different drawing, not a repaint: the mailbox and
  // robin move to the right, the parent and child are gone and so is the
  // handwritten "Ta gjerne kontakt", and it was delivered 1672×941 where the
  // day version is 1916×821. It is cropped to a band of the same proportions
  // (0, 60, 1672×717) so the hero keeps one shape in both themes, taking the
  // moon and the whole postbox and leaving the foreground flowers.
  {
    small: heroContactDark840,
    large: heroContactDark1400,
    smallJpg: heroContactDark840Jpg,
    largeJpg: heroContactDark1400Jpg,
    width: 1672,
    height: 717,
  },
);

export type IllustrationSet = ReturnType<typeof set>;
