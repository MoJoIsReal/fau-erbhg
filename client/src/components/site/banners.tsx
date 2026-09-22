import type { ReactNode } from "react";
import Artwork from "./artwork";
import type { IllustrationSet } from "./illustrations";

type BannerTone = "info" | "warm" | "calm" | "alert";

const BANNER_TONE: Record<BannerTone, { surface: string; icon: string }> = {
  info: { surface: "bg-blue-50", icon: "text-cat-mote-text" },
  warm: { surface: "bg-peach", icon: "text-cat-arrangement-text" },
  calm: { surface: "bg-green-50", icon: "text-brand" },
  alert: { surface: "bg-cat-stengt-tint", icon: "text-cat-stengt-text" },
};

interface InfoBannerProps {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  tone?: BannerTone;
  /** Announce it when it reports a problem rather than offering something. */
  role?: "status" | "alert";
}

/**
 * Icon, a short heading and one explaining sentence.
 *
 * Tone sets the temperature, not the severity: an alert-coloured box still
 * has to say what is wrong in words, because colour on its own tells a
 * colour-blind reader nothing (guide §9).
 */
export function InfoBanner({
  icon,
  title,
  children,
  action,
  tone = "calm",
  role,
}: InfoBannerProps) {
  const style = BANNER_TONE[tone];
  return (
    <div
      role={role}
      className={`flex flex-wrap items-center gap-x-5 gap-y-4 rounded-card px-5 py-4 ${style.surface}`}
    >
      {icon && <span className={`shrink-0 ${style.icon}`}>{icon}</span>}
      <div className="min-w-[14rem] flex-1">
        <p className="font-semibold text-ink">{title}</p>
        {children && <div className="mt-0.5 text-small text-copy">{children}</div>}
      </div>
      {action}
    </div>
  );
}

interface IllustrationBannerProps {
  art: IllustrationSet;
  /** Decorative by default; pass a description only if it carries meaning. */
  alt?: string;
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  hand?: string;
}

/**
 * A warm illustrated band, used to close a page rather than to open one.
 *
 * The artwork sits behind a text panel on desktop and above it on mobile —
 * never underneath the words, because these illustrations have too much
 * going on for text to stay legible on top of them at small sizes.
 */
export function IllustrationBanner({
  art,
  alt = "",
  eyebrow,
  title,
  children,
  action,
  hand,
}: IllustrationBannerProps) {
  return (
    <section className="overflow-hidden rounded-hero bg-green-50">
      <div className="grid md:grid-cols-2">
        {/* Stacked, the band takes the narrow crop's own ratio so the phone
            sees the picture the phone crop was cut for; side by side it fills
            whatever height the text column asks for. */}
        <div
          className="md:aspect-auto md:h-full md:min-h-[240px]"
          style={{ aspectRatio: art.ratio.narrow }}
        >
          <Artwork illustration={art} alt={alt} sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
        <div className="px-5 py-8 sm:px-8 md:px-10 md:py-10">
          {eyebrow && (
            <p className="text-micro font-semibold uppercase tracking-[0.14em] text-subtle">
              {eyebrow}
            </p>
          )}
          <p className="mt-2 text-h3 font-bold tracking-tight text-ink">{title}</p>
          {children && <div className="measure mt-3 text-copy">{children}</div>}
          {hand && (
            <p className="font-hand mt-4 text-xl text-brand" aria-hidden="true">
              {hand}
            </p>
          )}
          {action && <div className="mt-6 flex flex-wrap gap-3">{action}</div>}
        </div>
      </div>
    </section>
  );
}
