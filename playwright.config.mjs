import { defineConfig, devices } from "@playwright/test";

// Browser tests for the client's form flows (tests/e2e/). They run against the
// production build served by `vite preview`, with every /api/ request answered
// by a stub in the test itself: there is no backend here, as there is none
// locally (AGENTS.md). Build first — `npm run test:e2e` does both.
const PORT = 4173;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "nb-NO",
    timezoneId: "Europe/Oslo",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
