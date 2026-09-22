import type { CSSProperties } from "react";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import type { IllustrationSet } from "./illustrations";

/**
 * Where the narrow crop stops. It runs to 767px rather than 639 because a
 * band at 640–767px is barely 2.5:1 — narrower than any of the wide crops,
 * so `cover` would take the sides, and on Aktuelt the sides are the
 * signpost. Mirrors `.hero-band` and `.art-frame` in index.css.
 */
const NARROW = "(max-width: 767px)";

interface ArtworkProps {
  illustration: IllustrationSet;
  /**
   * What the picture shows, for anyone who cannot see it. Pass an empty
   * string when the illustration is purely decorative and the surrounding
   * HTML already says everything — that keeps it out of the screen-reader
   * output instead of adding noise (guide §18).
   */
  alt: string;
  className?: string;
  /** The hero image of the page above the fold; everything else waits. */
  priority?: boolean;
  /** `sizes` for the wide crop. The narrow one is always a full viewport. */
  sizes?: string;
}

/**
 * One illustration, cropped on purpose.
 *
 * Two rectangles were cut from the artwork rather than one (see
 * `illustrations.ts`): a wide one for the desktop band or column and a narrow
 * one composed for a phone. This picks between them with a `media` query, so
 * the browser fetches exactly one file — art direction, not a `sizes` hint.
 * Between those two ends, `object-position` comes from the artwork's own
 * focal point at each breakpoint tier, so a frame shallower than the crop
 * gives up sky or path rather than a child, a signpost or the postbox.
 *
 * In the dark theme it serves the night drawing of the same place. That is a
 * swap, not an overlay: no filter, no dimming, no scrim. The theme is a class
 * the user can set against their system preference, so it cannot be a
 * `prefers-color-scheme` source inside the `<picture>`, and rendering both to
 * hide one would download two illustrations to show one.
 */
export default function Artwork({
  illustration,
  alt,
  className = "",
  priority = false,
  sizes = "100vw",
}: ArtworkProps) {
  const isDark = useIsDarkTheme();
  const art = isDark ? illustration.dark : illustration.light;

  return (
    <picture>
      <source media={NARROW} type="image/webp" srcSet={art.narrow.srcSet} sizes="100vw" />
      <source media={NARROW} type="image/jpeg" srcSet={art.narrow.jpgSrcSet} sizes="100vw" />
      <source type="image/webp" srcSet={art.wide.srcSet} sizes={sizes} />
      <source type="image/jpeg" srcSet={art.wide.jpgSrcSet} sizes={sizes} />
      <img
        // Keyed on the theme so the browser starts the night file rather than
        // holding the day one until its replacement has decoded.
        key={isDark ? "dark" : "light"}
        src={art.wide.jpg}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        width={art.wide.width}
        height={art.wide.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        style={
          {
            "--art-pos": art.focus.narrow,
            "--art-pos-md": art.focus.mid,
            "--art-pos-lg": art.focus.wide,
          } as CSSProperties
        }
        className={`art-img h-full w-full object-cover ${className}`}
      />
    </picture>
  );
}
