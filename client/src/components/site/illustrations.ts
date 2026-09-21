import heroHome560 from "@/assets/illustrations/hero-home-560.webp";
import heroHome900 from "@/assets/illustrations/hero-home-900.webp";
import heroHome560Jpg from "@/assets/illustrations/hero-home-560.jpg";
import heroHome900Jpg from "@/assets/illustrations/hero-home-900.jpg";
import heroCalendar800 from "@/assets/illustrations/hero-calendar-800.webp";
import heroCalendar1400 from "@/assets/illustrations/hero-calendar-1400.webp";
import heroCalendar800Jpg from "@/assets/illustrations/hero-calendar-800.jpg";
import heroCalendar1400Jpg from "@/assets/illustrations/hero-calendar-1400.jpg";
import heroNews800 from "@/assets/illustrations/hero-news-800.webp";
import heroNews1400 from "@/assets/illustrations/hero-news-1400.webp";
import heroNews800Jpg from "@/assets/illustrations/hero-news-800.jpg";
import heroNews1400Jpg from "@/assets/illustrations/hero-news-1400.jpg";
import bannerFjord800 from "@/assets/illustrations/banner-fjord-800.webp";
import bannerFjord1400 from "@/assets/illustrations/banner-fjord-1400.webp";
import bannerFjord800Jpg from "@/assets/illustrations/banner-fjord-800.jpg";
import bannerFjord1400Jpg from "@/assets/illustrations/banner-fjord-1400.jpg";
import bannerSignpost900 from "@/assets/illustrations/banner-signpost-900.webp";
import bannerSignpost1600 from "@/assets/illustrations/banner-signpost-1600.webp";
import bannerSignpost900Jpg from "@/assets/illustrations/banner-signpost-900.jpg";
import bannerSignpost1600Jpg from "@/assets/illustrations/banner-signpost-1600.jpg";

/**
 * The illustration library.
 *
 * Every entry is the same hand-drawn Norwegian-nature family from the visual
 * profile, cut so that no two pages open with the same picture and so that
 * none of the artwork's own baked-in text competes with the page's real HTML
 * heading. The home banner, for instance, is the right-hand side of
 * banner_top — the children, the sun and the signpost — with the illustrated
 * "Velkommen til FAU Erdal Barnehage" lettering left out, because that
 * sentence belongs in the DOM (guide §14, rule 9).
 *
 * `focus` is the object-position used when the frame is narrower than the
 * artwork: it names the part that must survive the crop — children, signs and
 * the central landscape — rather than defaulting to the centre.
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

/** Two children and the LEK / MESTRING / GLEDE signpost. Home hero. */
export const ILLUSTRATION_HOME = set(
  heroHome560,
  heroHome900,
  heroHome560Jpg,
  heroHome900Jpg,
  560,
  // The 900px variant stops at the crop's own 852px rather than being
  // upscaled, and the descriptor has to say so or the browser picks wrongly.
  852,
  852,
  809,
  "50% 50%",
);

/** Children looking out over the fjord. Calendar hero. */
export const ILLUSTRATION_CALENDAR = set(
  heroCalendar800,
  heroCalendar1400,
  heroCalendar800Jpg,
  heroCalendar1400Jpg,
  800,
  1400,
  1672,
  941,
  "62% 70%",
);

/** Open hills and meadow. Aktuelt hero. */
export const ILLUSTRATION_NEWS = set(
  heroNews800,
  heroNews1400,
  heroNews800Jpg,
  heroNews1400Jpg,
  800,
  1400,
  1672,
  941,
  "55% 60%",
);

/** Quiet fjord landscape, no people and no lettering. Contact and documents. */
export const ILLUSTRATION_FJORD = set(
  bannerFjord800,
  bannerFjord1400,
  bannerFjord800Jpg,
  bannerFjord1400Jpg,
  800,
  // Like the home crop, the wide variant stops at the source's own width.
  1090,
  1090,
  339,
  "60% 55%",
);

/** The wide signpost banner. Closing band on the home page. */
export const ILLUSTRATION_SIGNPOST = set(
  bannerSignpost900,
  bannerSignpost1600,
  bannerSignpost900Jpg,
  bannerSignpost1600Jpg,
  900,
  1600,
  1774,
  887,
  "70% 55%",
);

export type IllustrationSet = ReturnType<typeof set>;
