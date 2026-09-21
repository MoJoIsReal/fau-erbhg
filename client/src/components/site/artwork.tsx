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
 */
export default function Artwork({
  illustration,
  alt,
  className = "",
  priority = false,
  sizes = "100vw",
}: ArtworkProps) {
  return (
    <picture>
      <source type="image/webp" srcSet={illustration.srcSet} sizes={sizes} />
      <source type="image/jpeg" srcSet={illustration.jpgSrcSet} sizes={sizes} />
      <img
        src={illustration.jpg}
        alt={alt}
        aria-hidden={alt === "" ? true : undefined}
        width={illustration.width}
        height={illustration.height}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "async" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        style={{ objectPosition: illustration.focus }}
        className={`h-full w-full object-cover ${className}`}
      />
    </picture>
  );
}
