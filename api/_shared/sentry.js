import * as Sentry from "@sentry/node";

// Initialize Sentry for error tracking and monitoring
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Don't send errors if DSN is not configured
  enabled: !!process.env.SENTRY_DSN,

  // Additional options
  beforeSend(event, hint) {
    // Filter out sensitive information
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
    }
    return event;
  }
});

export default Sentry;
