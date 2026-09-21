import heroHome747 from "@/assets/illustrations/hero-home-747.webp";
import heroHome1300 from "@/assets/illustrations/hero-home-1300.webp";
import heroHome747Jpg from "@/assets/illustrations/hero-home-747.jpg";
import heroHome1300Jpg from "@/assets/illustrations/hero-home-1300.jpg";
import bannerTogether620 from "@/assets/illustrations/banner-together-620.webp";
import bannerTogether772 from "@/assets/illustrations/banner-together-772.webp";
import bannerTogether620Jpg from "@/assets/illustrations/banner-together-620.jpg";
import bannerTogether772Jpg from "@/assets/illustrations/banner-together-772.jpg";
import heroCalendar840 from "@/assets/illustrations/hero-calendar-840.webp";
import heroCalendar1400 from "@/assets/illustrations/hero-calendar-1400.webp";
import heroCalendar840Jpg from "@/assets/illustrations/hero-calendar-840.jpg";
import heroCalendar1400Jpg from "@/assets/illustrations/hero-calendar-1400.jpg";
import heroNews900 from "@/assets/illustrations/hero-news-900.webp";
import heroNews900Jpg from "@/assets/illustrations/hero-news-900.jpg";
import heroDocuments900 from "@/assets/illustrations/hero-documents-900.webp";
import heroDocuments900Jpg from "@/assets/illustrations/hero-documents-900.jpg";
import heroContact800 from "@/assets/illustrations/hero-contact-800.webp";
import heroContact800Jpg from "@/assets/illustrations/hero-contact-800.jpg";

/**
 * The illustration library.
 *
 * Everything here is cut from the two supplied banner illustrations, so the
 * whole site stays in one hand-drawn Norwegian-nature family while no two
 * pages open with the same picture.
 *
 * Two rules govern every crop:
 *
 * 1. **The values are the official ones.** The only signpost that appears is
 *    the updated banner_top's FOR BARNA / SAMMEN / ENGASJEMENT. The earlier
 *    artwork carried invented value sets (LEK / MESTRING / GLEDE, LEK /
 *    LÆRING / FELLESSKAP); those files are gone, not merely unreferenced.
 *    "Små mennesker, store dager" stays as the secondary tagline.
 * 2. **No crop repeats the page's own heading.** banner_top has its headline
 *    set across the sky, and there is no rectangle that holds both children
 *    and the signpost while excluding it — the boy starts at x=930 and the
 *    headline runs to x=1008. The home crop therefore starts below the
 *    lettering instead of beside it: everything from y=345 down, which keeps
 *    the children (their hats begin at y=368) and the whole sign, and gives
 *    up the sun. That sentence belongs in the DOM, not in the picture.
 *
 * `focus` is the object-position used when the frame is narrower than the
 * artwork: it names what must survive the crop — children, signs, the sun —
 * rather than defaulting to the centre.
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

/** One image, one width. For a band that never needs a second step. */
function one(
  webp: string,
  jpg: string,
  width: number,
  height: number,
  focus: string,
): Illustration & { srcSet: string; jpgSrcSet: string } {
  return {
    webp,
    jpg,
    srcSet: `${webp} ${width}w`,
    jpgSrcSet: `${jpg} ${width}w`,
    width,
    height,
    focus,
  };
}

/**
 * Two children walking toward the FOR BARNA / SAMMEN / ENGASJEMENT signpost,
 * under the sun. The home page's hero, and the one place the official values
 * appear as artwork.
 */
export const ILLUSTRATION_HOME = set(
  heroHome747,
  heroHome1300,
  heroHome747Jpg,
  heroHome1300Jpg,
  747,
  // banner_top is only 1672px wide, and the one rectangle that holds both
  // children and the whole signpost without catching the artwork's own
  // headline is 747px of it. The wide step is a lanczos upscale of that —
  // flat illustration colour takes it well, and it beats letting the browser
  // stretch the small file across a 1224px band.
  1300,
  747,
  351,
  "50% 50%",
);

/** Two children sitting together over the fjord. Home's closing band. */
export const ILLUSTRATION_TOGETHER = set(
  bannerTogether620,
  bannerTogether772,
  bannerTogether620Jpg,
  bannerTogether772Jpg,
  620,
  772,
  772,
  611,
  "45% 55%",
);

/**
 * The fjord at golden hour, cropped below banner_bottom's own handwriting.
 *
 * The source carries "Små mennesker, store dager" across its sky, and the
 * hero band clipped it mid-word. The tagline is a real sentence on the page
 * already, so the picture gives it up: everything from y=274 down, which
 * starts just under the heart (ink ends at y=271) and just above the sun
 * (y=280), and keeps the children, the log and the meadow. Calendar hero.
 */
export const ILLUSTRATION_CALENDAR = set(
  heroCalendar840,
  heroCalendar1400,
  heroCalendar840Jpg,
  heroCalendar1400Jpg,
  840,
  1400,
  1400,
  514,
  "58% 55%",
);

/** Meadow and fjord at golden hour, no lettering. Aktuelt hero. */
export const ILLUSTRATION_NEWS = one(heroNews900, heroNews900Jpg, 900, 611, "50% 62%");

/** A cool, wide fjord band under a leafy branch. Dokumenter hero. */
export const ILLUSTRATION_DOCUMENTS = one(
  heroDocuments900,
  heroDocuments900Jpg,
  900,
  300,
  "55% 60%",
);

/**
 * Rock, daisies and the village across the water. Kontakt hero.
 *
 * Cropped from y=46 down: the source's hand-drawn heart sat against the top
 * edge and the band clipped it into a stray mark, so the crop starts just
 * below where that ink ends (y=43).
 */
export const ILLUSTRATION_CONTACT = one(heroContact800, heroContact800Jpg, 800, 235, "50% 55%");

export type IllustrationSet = ReturnType<typeof set>;
