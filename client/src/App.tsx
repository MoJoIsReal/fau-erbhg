import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import Layout from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

// Lazy load route components for code splitting
const Home = lazy(() => import("@/pages/home"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
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

// Loading fallback component
function PageLoader() {
  const { t } = useLanguage();
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-neutral-600 dark:text-neutral-300">
          {t.common.loading}
        </p>
      </div>
    </div>
  );
}

// 404: give the reader a way back rather than a dead end.
function NotFound() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <div className="text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          404
        </p>
        <h1 className="mb-3 font-heading text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {t.common.pageNotFound}
        </h1>
        <p className="mb-6 text-neutral-600 dark:text-neutral-300">
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

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || (roles && user && !roles.includes(user.role)))) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, roles, setLocation, user]);

  if (isLoading || !isAuthenticated || (roles && user && !roles.includes(user.role))) {
    return <PageLoader />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/kalender" component={CalendarPage} />
          <Route path="/kalender/arskalender" component={CalendarPage} />
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
            <Redirect to="/kalender/arskalender" />
          </Route>
          {/* Shipped briefly as /kalender/arshjul before the page settled on
              "Årskalender" everywhere. */}
          <Route path="/kalender/arshjul">
            <Redirect to="/kalender/arskalender" />
          </Route>
          <Route path="/nyhetsbrev" component={Newsletter} />
          <Route path="/newsletter" component={Newsletter} />
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
