// Minimal serverless error reporter placeholder.
// Vercel function logs are the active backend observability surface.
const Sentry = {
  captureException(error) {
    if (process.env.NODE_ENV === "production") {
      console.error("Captured API exception:", error);
    }
  },
};

export default Sentry;
