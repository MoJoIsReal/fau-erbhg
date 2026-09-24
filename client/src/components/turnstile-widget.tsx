import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { useIsDarkTheme } from "@/hooks/useIsDarkTheme";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Cloudflare Turnstile: the check that a public form (event signup, contact,
 * newsletter) is sent by a person. The widget hands the form a single-use
 * token, which api/_shared/turnstile.js verifies with Cloudflare.
 *
 * Off unless the build has VITE_TURNSTILE_SITE_KEY. Vite bakes the value in at
 * build time, so setting it in Vercel takes a redeploy to reach the browser —
 * and the server's TURNSTILE_SECRET_KEY must be set in the same deploy, or the
 * forms stop working (see docs/DEPLOYMENT.md).
 *
 * The script is loaded from challenges.cloudflare.com, which vercel.json's CSP
 * allows in script-src and frame-src; without that the widget never appears.
 */
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const turnstileEnabled = Boolean(SITE_KEY);

// Turnstile's codes for the site's two languages (Bokmål is "nb").
const WIDGET_LANGUAGE = { no: "nb", en: "en" } as const;

// "flexible" fills the form's width but never shrinks below 300px, so in a
// narrower column (a padded card on a phone) it would stick out of the form,
// and on a 320px screen out of the page. Cloudflare's "compact" size fits there.
const FLEXIBLE_MIN_WIDTH = 300;

// The code the API answers with when it refuses a token (api/_shared/turnstile.js).
export const TURNSTILE_FAILED = "TURNSTILE_FAILED";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// One script for the whole page, however many forms mount a widget.
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () =>
        window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not initialise"));
      script.onerror = () => {
        // Let a later mount try again rather than caching the failure.
        scriptPromise = null;
        script.remove();
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /** Discard the current token and get a fresh one. Tokens are single-use,
   * so a form calls this after every submit, successful or not. */
  reset(): void;
}

interface TurnstileWidgetProps {
  /** Receives each new token, and null whenever the current one stops being usable. */
  onToken(token: string | null): void;
  /** Show why the form cannot be sent yet: set by the form when it is
   * submitted without a token, or when the API refused the token. */
  showNotReady?: boolean;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ onToken, showNotReady = false }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const isDark = useIsDarkTheme();
    const { language, t } = useLanguage();
    const [loadFailed, setLoadFailed] = useState(false);

    useImperativeHandle(ref, () => ({
      reset() {
        onTokenRef.current(null);
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      },
    }), []);

    // Rendered again when the theme or language changes: Turnstile fixes both
    // at render time. Like the page artwork, the dark theme swaps to the
    // widget's own dark variant rather than dimming the light one.
    useEffect(() => {
      const container = containerRef.current;
      if (!SITE_KEY || !container) return;
      let cancelled = false;
      loadTurnstile()
        .then((turnstile) => {
          if (cancelled) return;
          setLoadFailed(false);
          widgetId.current = turnstile.render(container, {
            sitekey: SITE_KEY,
            theme: isDark ? "dark" : "light",
            language: WIDGET_LANGUAGE[language],
            size: container.clientWidth >= FLEXIBLE_MIN_WIDTH ? "flexible" : "compact",
            callback: (token: string) => {
              setLoadFailed(false);
              onTokenRef.current(token);
            },
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          });
        })
        .catch(() => {
          if (!cancelled) setLoadFailed(true);
        });
      return () => {
        cancelled = true;
        onTokenRef.current(null);
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
    }, [isDark, language]);

    if (!SITE_KEY) return null;

    const message = loadFailed ? t.turnstile.loadFailed : showNotReady ? t.turnstile.notReady : null;
    return (
      <div className="space-y-2">
        {/* 65px is the widget's own height, reserved so the form does not jump when it appears. */}
        <div ref={containerRef} role="group" aria-label={t.turnstile.label} className="min-h-[65px]" />
        {message && (
          <p role="alert" className="flex items-start gap-2 text-small font-medium text-destructive">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{message}</span>
          </p>
        )}
      </div>
    );
  },
);
