import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { Switch, Route, useLocation } from "wouter";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

// Lazy load route components for code splitting
const Home = lazy(() => import("@/pages/home"));
const Events = lazy(() => import("@/pages/events"));
const News = lazy(() => import("@/pages/news"));
const Contact = lazy(() => import("@/pages/contact"));
const Files = lazy(() => import("@/pages/files"));
const Settings = lazy(() => import("@/pages/settings"));
const Content = lazy(() => import("@/pages/content"));
const Messages = lazy(() => import("@/pages/messages"));
const YearlyCalendar = lazy(() => import("@/pages/yearly-calendar"));
const Privacy = lazy(() => import("@/pages/privacy"));
const Newsletter = lazy(() => import("@/pages/newsletter"));

// Loading fallback component
function PageLoader() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-neutral-50"
      role="status"
      aria-live="polite"
    >
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-neutral-600">Laster...</p>
      </div>
    </div>
  );
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
          <Route path="/events" component={Events} />
          <Route path="/news" component={News} />
          <Route path="/tips-tricks" component={News} />
          <Route path="/tips-og-triks" component={News} />
          <Route path="/contact" component={Contact} />
          <Route path="/files" component={Files} />
          <Route path="/personvern" component={Privacy} />
          <Route path="/privacy" component={Privacy} />
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
          <Route path="/arskalender" component={YearlyCalendar} />
          <Route path="/nyhetsbrev" component={Newsletter} />
          <Route path="/newsletter" component={Newsletter} />
          <Route>
            <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-neutral-900 mb-4">404 - Side ikke funnet</h1>
                <p className="text-neutral-600">Siden du leter etter finnes ikke.</p>
              </div>
            </div>
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
