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
const Messages = lazy(() => import("@/pages/messages"));
const YearlyCalendar = lazy(() => import("@/pages/yearly-calendar"));

// Loading fallback component
function PageLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-neutral-600">Laster...</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading || !isAuthenticated) {
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
          <Route path="/contact" component={Contact} />
          <Route path="/files" component={Files} />
          <Route path="/settings">
            <RequireAuth>
              <Settings />
            </RequireAuth>
          </Route>
          <Route path="/messages">
            <RequireAuth>
              <Messages />
            </RequireAuth>
          </Route>
          <Route path="/arskalender" component={YearlyCalendar} />
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
