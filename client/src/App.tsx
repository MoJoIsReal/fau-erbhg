import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout";
import LoginModal from "@/components/login-modal";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MEDIA_SHARE_ROLES } from "@shared/constants";

// The landing page is part of the main bundle: as a lazy route its code, and
// the hero image it names, were only discovered after main had loaded and run,
// one more round trip before the first meaningful paint. It is about 3 kB.
import Home from "@/pages/home";

// Lazy load the other route components for code splitting
const CalendarPage = lazy(() => import("@/pages/calendar"));
// The yearly calendar is no longer a public tab. It stays as the editor
// surface for the printable årskalender — drag-and-drop month layout and the
// month-by-month PDF — reached from the calendar's editor toolbar.
const News = lazy(() => import("@/pages/news"));
const NewsPost = lazy(() => import("@/pages/news-post"));
const Contact = lazy(() => import("@/pages/contact"));
const Files = lazy(() => import("@/pages/files"));
const Settings = lazy(() => import("@/pages/settings"));
const Admin = lazy(() => import("@/pages/admin"));
const Content = lazy(() => import("@/pages/content"));
const Messages = lazy(() => import("@/pages/messages"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Newsletter = lazy(() => import("@/pages/newsletter"));
const RegistrationCancel = lazy(() => import("@/pages/registration-cancel"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
// Private media shares (docs/mediedeling.md). The page parents open, /del,
// is not a route here: it is its own entry point, client/del.html.
const MediaShares = lazy(() => import("@/pages/media-shares"));

// Loading fallback component
function PageLoader() {
  const { t } = useLanguage();
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-sand"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="animate-spin rounded-pill h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-subtle">
          {t.common.loading}
        </p>
      </div>
    </div>
  );
}

// 404: give the reader a way back rather than a dead end.
function NotFound() {
  const { t } = useLanguage();
  // The server answers 200 for every route, so this is how a crawler learns
  // the page does not exist (a "soft 404" otherwise).
  usePageMeta({ title: t.common.pageNotFound, description: t.common.pageNotFoundBody, noindex: true });
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <div className="text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-subtle">
          404
        </p>
        <h1 className="mb-3 text-2xl font-bold text-ink">
          {t.common.pageNotFound}
        </h1>
        <p className="mb-6 text-subtle">
          {t.common.pageNotFoundBody}
        </p>
        <Link href="/">
          <Button>{t.common.goHomePage}</Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * Send a retired URL to its replacement without leaving a history entry, so
 * the back button doesn't bounce the reader straight back out. Links posted
 * to Facebook or saved in bookmarks still land in the right place.
 */
function Redirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation(to, { replace: true });
  }, [to, setLocation]);

  return <PageLoader />;
}

function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  // Whether this page has had a signed-in user. A session that runs out
  // afterwards (any 401, or the auth refetch answering null) used to send the
  // user to "/", unmounting the page and the post, reply or settings they had
  // not saved yet. Now the page stays mounted under a sign-in prompt, and once
  // signed in again the user can save what is still on screen. Logging out on
  // purpose reloads the site, so it never gets here.
  const signedIn = useRef(false);
  if (isAuthenticated) signedIn.current = true;
  const forbidden = Boolean(roles && user && !roles.includes(user.role));
  const sessionLost = signedIn.current && !isLoading && !isAuthenticated;
  // Closing the prompt keeps the page too, so the text can still be copied;
  // the header's sign-in button is there when the user is ready.
  const [promptDismissed, setPromptDismissed] = useState(false);
  useEffect(() => {
    if (isAuthenticated) setPromptDismissed(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isLoading && forbidden) setLocation("/");
  }, [forbidden, isLoading, setLocation]);

  // Opened without a session (a bookmark, a link in a mail): ask for the
  // sign-in here, and show the page once it succeeds. This used to send the
  // visitor to the home page without a word, and after signing in there they
  // had to find their way back. Closing the prompt goes home, as before.
  if (!isLoading && !isAuthenticated && !signedIn.current) {
    return (
      <>
        <PageLoader />
        <LoginModal isOpen onSignedIn={() => {}} onClose={() => setLocation("/")} />
      </>
    );
  }

  if (!sessionLost && (isLoading || !isAuthenticated || forbidden)) {
    return <PageLoader />;
  }

  // The same element shape whether or not the prompt shows, so React keeps
  // the page (and its unsaved state) mounted when the prompt appears.
  return (
    <>
      {children}
      {sessionLost && (
        <LoginModal
          isOpen={!promptDismissed}
          sessionExpired
          onSignedIn={() => {}}
          onClose={() => setPromptDismissed(true)}
        />
      )}
    </>
  );
}

function Router() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/kalender" component={CalendarPage} />
          <Route path="/kalender/arskalender">
            <Redirect to="/kalender?view=month" />
          </Route>
          {/* Was the "Hva skjer" tab until the calendar merged into one view. */}
          <Route path="/kalender/arrangementer">
            <Redirect to="/kalender" />
          </Route>
          {/* Retired top-level calendar URLs. Both are still in circulation
              (newsletters, Facebook posts, bookmarks), so they redirect
              rather than 404. */}
          <Route path="/events">
            <Redirect to="/kalender" />
          </Route>
          <Route path="/calendar">
            <Redirect to="/kalender" />
          </Route>
          <Route path="/news" component={News} />
          <Route path="/nyheter" component={News} />
          <Route path="/nyheter/:id" component={NewsPost} />
          <Route path="/tips-tricks" component={News} />
          <Route path="/tips-og-triks" component={News} />
          <Route path="/contact" component={Contact} />
          <Route path="/files" component={Files} />
          <Route path="/personvern" component={Privacy} />
          <Route path="/privacy" component={Privacy} />
          <Route path="/admin/media">
            <RequireAuth roles={MEDIA_SHARE_ROLES}>
              <MediaShares />
            </RequireAuth>
          </Route>
          <Route path="/admin">
            <RequireAuth roles={["admin", "member"]}>
              <Admin />
            </RequireAuth>
          </Route>
          <Route path="/settings">
            <RequireAuth roles={["admin"]}>
              <Settings />
            </RequireAuth>
          </Route>
          <Route path="/content">
            <RequireAuth roles={["admin", "member"]}>
              <Content />
            </RequireAuth>
          </Route>
          <Route path="/messages">
            <RequireAuth roles={["admin", "member"]}>
              <Messages />
            </RequireAuth>
          </Route>
          <Route path="/arskalender">
            <Redirect to="/kalender?view=month" />
          </Route>
          {/* Shipped briefly as /kalender/arshjul before the page settled on
              "Årskalender" everywhere. */}
          <Route path="/kalender/arshjul">
            <Redirect to="/kalender?view=month" />
          </Route>
          <Route path="/nyhetsbrev" component={Newsletter} />
          <Route path="/newsletter" component={Newsletter} />
          <Route path="/avmelding" component={RegistrationCancel} />
          <Route path="/nytt-passord" component={ResetPassword} />
          <Route>
            <NotFound />
          </Route>
        </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <TooltipProvider>
      <Router />
    </TooltipProvider>
  );
}

export default App;
