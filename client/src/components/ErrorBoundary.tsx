import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import * as Sentry from '@sentry/react';
import { isStaleChunkError, reloadForStaleChunk } from '@/lib/stale-chunk';
import { translations, type Language } from '@/lib/i18n';

// The boundary sits above LanguageProvider, so it reads the saved language
// itself (the provider's own source), falling back to Norwegian.
function savedLanguage(): Language {
  try {
    return localStorage.getItem('fau-language') === 'en' ? 'en' : 'no';
  } catch {
    return 'no';
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // A lazy route from a previous deploy: reload into the current build
    // rather than reporting it as a crash.
    if (isStaleChunkError(error) && reloadForStaleChunk()) return;

    console.error('Uncaught error:', error, errorInfo);

    // Send to Sentry in production
    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack },
      });
    }
  }

  // Back and forward leave the broken page, so they clear the error screen:
  // "Go back" used to change the address and keep showing the error.
  private handlePopState = () => {
    if (this.state.hasError) this.setState({ hasError: false, error: null });
  };

  public componentDidMount() {
    window.addEventListener('popstate', this.handlePopState);
  }

  public componentWillUnmount() {
    window.removeEventListener('popstate', this.handlePopState);
  }

  // Reloads the page the visitor was on; it used to go to the home page.
  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const copy = translations[savedLanguage()].common;
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-sand">
          <Card className="max-w-md w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                {copy.crashTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-subtle">{copy.crashBody}</p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="bg-muted p-3 rounded text-xs">
                  <summary className="cursor-pointer font-medium text-ink">
                    {copy.crashDetails}
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-destructive">
                    {this.state.error.toString()}
                  </pre>
                </details>
              )}

              <div className="flex gap-2">
                <Button onClick={this.handleReload} className="flex-1">
                  {copy.crashReload}
                </Button>
                <Button
                  onClick={() => window.history.back()}
                  variant="outline"
                  className="flex-1"
                >
                  {copy.crashBack}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
