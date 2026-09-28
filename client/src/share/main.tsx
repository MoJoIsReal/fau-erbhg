/**
 * Entry point of the private media share page (/del, client/del.html).
 *
 * Deliberately not part of the main app: it imports neither Sentry nor
 * Vercel Analytics nor the site's ErrorBoundary (which reports to Sentry),
 * so a parent opening a share makes no request to anyone but us and R2.
 * deploy-config.test.mjs checks that nothing drags them in.
 */
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import "./share.css";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import SharePage from "./share-page";

const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
});

function CrashNotice() {
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-editor px-4 py-16 text-center">
      <p className="text-h4 font-semibold text-ink">{t.mediaShare.errorTitle}</p>
      <p className="mt-2 text-subtle">{t.mediaShare.reloadHint}</p>
    </main>
  );
}

// Reports nothing anywhere: a crash here is shown, not sent.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <CrashNotice /> : this.props.children;
  }
}

// Another link pasted into the same tab only changes the fragment.
window.addEventListener("hashchange", () => window.location.reload());

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <Boundary>
      <QueryClientProvider client={queryClient}>
        <SharePage />
      </QueryClientProvider>
    </Boundary>
  </LanguageProvider>,
);
