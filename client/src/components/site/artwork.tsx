import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import type { IllustrationSet } from "./illustrations";

interface ArtworkProps {
  illustration: IllustrationSet;
  /**
   * What the picture shows, for anyone who cannot see it. Pass an empty
   * string when the illustration is purely decorative and the surrounding
   * HTML already says everything — that keeps it out of the screen-reader
   * output instead of adding noise (guide §18).
   */
  alt: string;
  /** Tailwind aspect-ratio classes; responsive crops are set by the caller. */
  className?: string;
  /** The hero image of the page above the fold; everything else waits. */
  priority?: boolean;
  sizes?: string;
}

/**
 * One illustration, cropped responsibly.
 *
 * WebP with a JPEG fallback, two widths behind `sizes`, an explicit intrinsic
 * ratio so nothing jumps while it loads, and `object-position` taken from the
 * artwork's own focal point so children and signs survive a narrow frame
 * rather than being centre-cropped out of it (guide §14).
 *
 * In the dark theme it serves the night drawing of the same scene instead.
 * That is a swap, not an overlay: the theme is a class the user can set
 * against their system preference, so it cannot be a `prefers-color-scheme`
 * source in the `<picture>`, and rendering both and hiding one would download
 * two illustrations to show one. Only the chosen file is ever fetched.
 */
export default function Artwork({
  illustration,
  alt,
  className = "",
  priority = false,
  sizes = "100vw",
}: ArtworkProps) {
  const isDark = useIsDarkTheme();
  const art = isDark ? illustration.dark : illustration;

  return (
    <picture>
      <source type="image/webp" srcSet={art.srcSet} sizes={sizes} />
      <source type="image/jpeg" srcSet={art.jpgSrcSet} sizes={sizes} />
      <img
        // Keyed on the theme so the browser starts the night file rather than
        // holding the day one until its replacement has decoded.
        key={isDark ? "dark" : "light"}
        src={art.jpg}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        width={art.width}
        height={art.height}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "async" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        style={{ objectPosition: art.focus }}
        className={`h-full w-full object-cover ${className}`}
      />
    </picture>
  );
}
