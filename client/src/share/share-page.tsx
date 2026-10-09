import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, Lock, Music, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/site/section";
import LanguageToggle from "@/components/language-toggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatDate } from "@/lib/i18n";
import type { SharedMedia, SharedMediaFile } from "@shared/schema";
import { MEDIA_PIN_PATTERN } from "@shared/media";

// The link is /del#<token>. The fragment never leaves the browser — not in a
// request, not in a Referer — so the only place the token goes is the body
// of the POST below.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readToken(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
}

// After a correct PIN the API returns a grant, kept for this tab only so a
// reload or a refresh of the playback URLs does not ask for the PIN again.
const grantKey = (token: string) => `fau-media-grant:${token.slice(0, 12)}`;
function loadGrant(token: string): string | undefined {
  try {
    return sessionStorage.getItem(grantKey(token)) ?? undefined;
  } catch {
    return undefined;
  }
}
function saveGrant(token: string, grant: string) {
  try {
    sessionStorage.setItem(grantKey(token), grant);
  } catch {
    // Private mode or blocked storage: the grant simply lives in memory.
  }
}

type ViewResult =
  | { kind: "ok"; share: SharedMedia }
  | { kind: "pin"; reason: "required" | "wrong" | "locked" }
  | { kind: "unavailable" }
  | { kind: "busy" };

async function requestView(token: string, pin?: string, grant?: string): Promise<ViewResult> {
  const res = await fetch("/api/media?action=view", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, ...(pin ? { pin } : {}), ...(grant ? { grant } : {}) }),
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { kind: "ok", share: body as SharedMedia };
  switch (body?.code) {
    case "PIN_REQUIRED":
      return { kind: "pin", reason: "required" };
    case "PIN_INVALID":
      return { kind: "pin", reason: "wrong" };
    case "PIN_LOCKED":
      return { kind: "pin", reason: "locked" };
    case "SHARE_UNAVAILABLE":
      return { kind: "unavailable" };
    case "RATE_LIMITED":
      return { kind: "busy" };
    default:
      throw new Error(`Share request failed with ${res.status}`);
  }
}

// Playback URLs last an hour. A player that hits an expired one asks for a
// fresh set, at most this often, and resumes where it was.
const REFRESH_MIN_INTERVAL_MS = 30_000;

export default function SharePage() {
  const { t } = useLanguage();
  const token = useMemo(readToken, []);
  const wellFormed = TOKEN_PATTERN.test(token);
  const grant = useRef<string | undefined>(wellFormed ? loadGrant(token) : undefined);
  const [result, setResult] = useState<ViewResult | null>(wellFormed ? null : { kind: "unavailable" });
  const lastRefresh = useRef(0);

  const view = useMutation({
    mutationFn: (pin?: string) => requestView(token, pin, grant.current),
    onSuccess: (next) => {
      if (next.kind === "ok" && next.share.grant) {
        grant.current = next.share.grant;
        saveGrant(token, next.share.grant);
      }
      // A stale grant is simply not accepted; fall back to asking for the PIN.
      setResult(next);
    },
  });

  // Once, on load.
  useEffect(() => {
    if (wellFormed) view.mutate(undefined);
  }, []);

  const share = result?.kind === "ok" ? result.share : null;

  const refresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefresh.current = now;
    requestView(token, undefined, grant.current)
      // A refresh that is rate limited keeps what is on screen; anything
      // else — fresh URLs, a grant that ran out, a share revoked meanwhile —
      // replaces it.
      .then((next) => {
        if (next.kind !== "busy") setResult(next);
      })
      .catch(() => undefined);
  }, [token]);

  const urlsExpired = useCallback(
    () => !!share && Date.now() > Date.parse(share.urlsExpireAt) - 60_000,
    [share],
  );

  // A phone that comes back to the tab hours later: renew before anything is tapped.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && urlsExpired()) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh, urlsExpired]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-editor items-center justify-between gap-4 px-4 py-2">
          <p className="text-small font-semibold text-ink">FAU Erdal Barnehage</p>
          <LanguageToggle />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-editor flex-1 px-4 py-8 sm:py-12">
        {view.isError ? (
          <EmptyState
            isError
            title={t.mediaShare.errorTitle}
            description={t.mediaShare.errorBody}
            action={<Button onClick={() => view.mutate(undefined)}>{t.mediaShare.retry}</Button>}
          />
        ) : result === null ? (
          <p role="status" className="py-16 text-center text-subtle">{t.mediaShare.loading}</p>
        ) : result.kind === "unavailable" ? (
          <EmptyState
            icon={<Lock className="h-6 w-6" aria-hidden="true" />}
            title={t.mediaShare.unavailableTitle}
            description={t.mediaShare.unavailableBody}
          />
        ) : result.kind === "busy" ? (
          <EmptyState
            isError
            title={t.mediaShare.busyTitle}
            description={t.mediaShare.busyBody}
            action={<Button onClick={() => view.mutate(undefined)}>{t.mediaShare.retry}</Button>}
          />
        ) : result.kind === "pin" ? (
          <PinForm reason={result.reason} pending={view.isPending} onSubmit={(pin) => view.mutate(pin)} />
        ) : (
          <ShareContent share={result.share} onExpired={refresh} urlsExpired={urlsExpired} />
        )}
      </main>
    </div>
  );
}

function PinForm({ reason, pending, onSubmit }: {
  reason: "required" | "wrong" | "locked";
  pending: boolean;
  onSubmit: (pin: string) => void;
}) {
  const { t } = useLanguage();
  const [pin, setPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = MEDIA_PIN_PATTERN.test(pin);
  const message = reason === "wrong" ? t.mediaShare.pinWrong : reason === "locked" ? t.mediaShare.pinLocked : null;

  useEffect(() => {
    if (reason === "wrong") {
      setPin("");
      inputRef.current?.focus();
    }
  }, [reason]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid && !pending) onSubmit(pin);
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm py-8" noValidate>
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-pill bg-green-50 text-brand">
        <Lock className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-center text-h3 font-bold text-ink">{t.mediaShare.pinTitle}</h1>
      <p className="mt-2 text-center text-subtle">{t.mediaShare.pinBody}</p>
      <div className="mt-6 space-y-2">
        <Label htmlFor="share-pin">{t.mediaShare.pinLabel}</Label>
        <Input
          ref={inputRef}
          id="share-pin"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          autoFocus
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
          aria-invalid={reason === "wrong" || undefined}
          aria-describedby={message ? "share-pin-message" : undefined}
          disabled={reason === "locked"}
        />
        {message && (
          <p id="share-pin-message" role="alert" className="text-small font-semibold text-cat-stengt-text">
            {message}
          </p>
        )}
      </div>
      <Button type="submit" className="mt-6 w-full" disabled={!valid || pending || reason === "locked"}>
        {pending ? t.mediaShare.opening : t.mediaShare.pinSubmit}
      </Button>
    </form>
  );
}

function ShareContent({ share, onExpired, urlsExpired }: {
  share: SharedMedia;
  onExpired: () => void;
  urlsExpired: () => boolean;
}) {
  const { t, language } = useLanguage();
  const images = share.files.filter((file) => file.kind === "image");
  const videos = share.files.filter((file) => file.kind === "video");
  const audios = share.files.filter((file) => file.kind === "audio");
  const [openImage, setOpenImage] = useState<number | null>(null);
  const expires = formatDate(share.expiresAt, language);

  const counts = [
    images.length ? `${images.length} ${images.length === 1 ? t.mediaShare.photo : t.mediaShare.photos}` : null,
    videos.length ? `${videos.length} ${videos.length === 1 ? t.mediaShare.videoOne : t.mediaShare.videos}` : null,
    audios.length ? `${audios.length} ${audios.length === 1 ? t.mediaShare.audioOne : t.mediaShare.audios}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <article className="share-media" onContextMenu={(event) => event.preventDefault()}>
      <h1 className="text-h1 font-bold tracking-tight text-ink">{share.title}</h1>
      {share.description && <p className="measure mt-3 whitespace-pre-line text-body-lg text-copy">{share.description}</p>}
      <p className="mt-3 text-small text-subtle">
        {counts}
        {counts && " · "}
        {t.mediaShare.availableUntil.replace("{date}", expires)}
      </p>

      {images.length > 0 && (
        <section aria-labelledby="share-photos" className="mt-8">
          <h2 id="share-photos" className="mb-3 flex items-center gap-2 text-h4 font-semibold text-ink">
            <ImageIcon className="h-5 w-5 text-brand" aria-hidden="true" />
            {t.mediaShare.photosHeading}
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {images.map((file, index) => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => setOpenImage(index)}
                  className="block aspect-square w-full overflow-hidden rounded-token bg-green-50"
                  aria-label={t.mediaShare.openPhoto.replace("{n}", String(index + 1)).replace("{total}", String(images.length))}
                >
                  <img
                    src={file.previewUrl ?? file.url}
                    alt=""
                    loading={index < 6 ? "eager" : "lazy"}
                    decoding="async"
                    draggable={false}
                    width={file.width ?? undefined}
                    height={file.height ?? undefined}
                    onError={onExpired}
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {videos.length > 0 && (
        <section aria-labelledby="share-videos" className="mt-10">
          <h2 id="share-videos" className="mb-3 flex items-center gap-2 text-h4 font-semibold text-ink">
            <Film className="h-5 w-5 text-brand" aria-hidden="true" />
            {t.mediaShare.videosHeading}
          </h2>
          <ul className="space-y-6">
            {videos.map((file, index) => (
              <li key={file.id}>
                <Player
                  file={file}
                  label={`${t.mediaShare.video} ${index + 1}`}
                  onExpired={onExpired}
                  urlsExpired={urlsExpired}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {audios.length > 0 && (
        <section aria-labelledby="share-audio" className="mt-10">
          <h2 id="share-audio" className="mb-3 flex items-center gap-2 text-h4 font-semibold text-ink">
            <Music className="h-5 w-5 text-brand" aria-hidden="true" />
            {t.mediaShare.audioHeading}
          </h2>
          <ul className="space-y-4">
            {audios.map((file, index) => (
              <li key={file.id}>
                <p className="mb-1 text-small font-semibold text-ink">{`${t.mediaShare.audio} ${index + 1}`}</p>
                <Player
                  file={file}
                  label={`${t.mediaShare.audio} ${index + 1}`}
                  onExpired={onExpired}
                  urlsExpired={urlsExpired}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-12 flex gap-4 rounded-card bg-green-50 px-5 py-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <p className="font-semibold text-ink">{t.mediaShare.privacyTitle}</p>
          <p className="mt-1 text-small text-copy">{t.mediaShare.privacyBody.replace("{date}", expires)}</p>
        </div>
      </footer>

      <Lightbox
        images={images}
        title={share.title}
        index={openImage}
        onIndex={setOpenImage}
        onExpired={onExpired}
      />
    </article>
  );
}

/**
 * <video> or <audio> with native controls. When its URL has expired it asks
 * for a fresh one and picks up at the same second, playing if it was.
 */
function Player({ file, label, onExpired, urlsExpired }: {
  file: SharedMediaFile;
  label: string;
  onExpired: () => void;
  urlsExpired: () => boolean;
}) {
  const resume = useRef<{ time: number; play: boolean } | null>(null);

  const renew = (element: HTMLMediaElement, play: boolean) => {
    resume.current = { time: element.currentTime, play };
    onExpired();
  };

  const common = {
    controls: true,
    preload: "metadata" as const,
    controlsList: "nodownload",
    "aria-label": label,
    onError: (event: SyntheticEvent<HTMLMediaElement>) => renew(event.currentTarget, !event.currentTarget.paused),
    onPlay: (event: SyntheticEvent<HTMLMediaElement>) => {
      if (urlsExpired()) {
        event.currentTarget.pause();
        renew(event.currentTarget, true);
      }
    },
    onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => {
      const pending = resume.current;
      if (!pending) return;
      resume.current = null;
      event.currentTarget.currentTime = pending.time;
      if (pending.play) event.currentTarget.play().catch(() => undefined);
    },
  };

  if (file.kind === "audio") {
    return <audio {...common} src={file.url} className="w-full" />;
  }
  // `#t=0.001` makes iOS Safari paint the first frame instead of a black
  // box. A media fragment is never sent to R2, so the signature is unaffected.
  return (
    <video
      {...common}
      src={`${file.url}#t=0.001`}
      playsInline
      className="w-full rounded-card bg-black"
      style={file.width && file.height ? { aspectRatio: `${file.width} / ${file.height}` } : undefined}
    />
  );
}

function Lightbox({ images, title, index, onIndex, onExpired }: {
  images: SharedMediaFile[];
  title: string;
  index: number | null;
  onIndex: (index: number | null) => void;
  onExpired: () => void;
}) {
  const { t } = useLanguage();
  const touchStart = useRef<number | null>(null);
  const open = index !== null && images[index] !== undefined;
  const current = open ? images[index] : null;
  const count = images.length;
  const go = (step: number) => {
    if (index === null) return;
    onIndex((index + step + count) % count);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onIndex(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black" />
        <DialogPrimitive.Content
          className="share-media fixed inset-0 z-50 flex flex-col text-white focus:outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") go(1);
            if (event.key === "ArrowLeft") go(-1);
          }}
          onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const end = event.changedTouches[0]?.clientX;
            touchStart.current = null;
            if (start !== null && end !== undefined && Math.abs(end - start) > 50) go(end < start ? 1 : -1);
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t.mediaShare.lightboxHint}</DialogPrimitive.Description>
          <div className="flex items-center justify-between gap-4 px-2 py-2">
            <p className="px-2 text-small tabular-nums" aria-live="polite">
              {index !== null ? `${index + 1} / ${count}` : ""}
            </p>
            <DialogPrimitive.Close
              className="grid h-11 w-11 place-items-center rounded-pill hover:bg-white/10"
              aria-label={t.mediaShare.close}
            >
              <X className="h-6 w-6" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
            {current && (
              <img
                key={current.id}
                src={current.url}
                alt=""
                draggable={false}
                onError={onExpired}
                className="max-h-full max-w-full object-contain"
              />
            )}
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-pill bg-black/50 hover:bg-black/70"
                  aria-label={t.mediaShare.previous}
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-pill bg-black/50 hover:bg-black/70"
                  aria-label={t.mediaShare.next}
                >
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
