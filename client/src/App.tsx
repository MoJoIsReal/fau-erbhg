import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import Home from "@/pages/home";
import Events from "@/pages/events";
import News from "@/pages/news";
import Contact from "@/pages/contact";
import Files from "@/pages/files";
import Settings from "@/pages/settings";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/events" component={Events} />
        <Route path="/news" component={News} />
        <Route path="/contact" component={Contact} />
        <Route path="/files" component={Files} />
        <Route path="/settings" component={Settings} />
        <Route>
          <div className="min-h-screen w-full flex items-center justify-center bg-neutral-50">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-neutral-900 mb-4">404 - Side ikke funnet</h1>
              <p className="text-neutral-600">Siden du leter etter finnes ikke.</p>
            </div>
          </div>
        </Route>
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
