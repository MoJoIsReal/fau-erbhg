import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/react";
import ErrorBoundary from "@/components/ErrorBoundary";
import * as Sentry from "@sentry/react";
import { reloadForStaleChunk } from "@/lib/stale-chunk";
import { privateTelemetryTransport, scrubTelemetry } from "@/lib/telemetry-privacy";

// Initialize Sentry for error tracking in production
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    transport: options => privateTelemetryTransport(Sentry.makeFetchTransport(options)),
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    // Replay stays disabled: DOM masking does not protect URL metadata.
  });
}

// Vite fires this when a lazy chunk from an older deploy is gone; reloading
// fetches the current build instead of showing the error screen.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForStaleChunk()) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    {/* The system preference is the default, an explicit choice overrides it
        and is remembered, and next-themes' own blocking script applies the
        class before first paint so there is no flash of the wrong theme
        (guide v1.1 §19, "Temaadferd"). */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <App />
          <Toaster />
          <Analytics beforeSend={scrubTelemetry} debug={false} />
        </LanguageProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);
