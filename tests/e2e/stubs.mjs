// Shared set-up for the browser suites: the page talks to nothing but the
// preview server and the stubs a test registers.
import { test as base, expect } from "@playwright/test";
import { translations } from "../../client/src/lib/i18n.ts";

// The site opens in Norwegian (LanguageContext), so a test reads its labels
// and messages from the same table the page renders. Copy can change without
// breaking a test; a missing translation still does.
export const t = translations.no;

export const CSRF_TOKEN = "e2e-csrf-token";

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL).origin;
    // Nothing leaves the machine: no fonts, analytics or Turnstile from
    // another origin (the build has no site key, so the widget is off).
    await page.route((url) => url.origin !== origin, (route) => route.abort());
    // Any API call a test did not stub is a 404 rather than the SPA's
    // index.html, which would fail as JSON in a way that hides the cause.
    // Routes registered later take precedence, so a test's own stubs win.
    await page.route("**/api/**", (route) =>
      route.fulfill({ status: 404, json: { error: "Not stubbed in this test", code: "NOT_FOUND" } }),
    );
    // Anonymous by default, as `GET /api/auth` answers without a session.
    await page.route("**/api/auth", (route) => route.fulfill({ json: null }));
    // apiRequest() echoes this cookie as X-CSRF-Token on every write.
    await page.context().addCookies([{ name: "csrf-token", value: CSRF_TOKEN, url: origin }]);
    await use(page);
  },
});

export { expect };

/**
 * Answer one API route and record what was sent to it. `respond` gets the
 * request and returns `{ status?, json }`; requests whose method does not
 * match fall through to the next route.
 */
export async function stubApi(page, url, method, respond) {
  const calls = [];
  await page.route(url, async (route) => {
    const request = route.request();
    if (request.method() !== method) return route.fallback();
    calls.push({ body: request.postDataJSON(), headers: request.headers() });
    const { status = 200, json } = await respond(request);
    return route.fulfill({ status, json });
  });
  return calls;
}

/** Sign in as a council member for the guarded pages. */
export async function signInAs(page, role) {
  await page.route("**/api/auth", (route) =>
    route.fulfill({
      json: { userId: 1, username: `${role}@example.test`, name: "Test Testesen", role, passwordChangeRequired: false },
    }),
  );
}

/**
 * Pick an option in one of the shadcn/Radix selects, by its label and option
 * text. `scope` is the page or a locator around the field; the listbox opens
 * in a portal, so the option is looked up on the page.
 */
export async function choose(scope, label, option) {
  const page = "page" in scope ? scope.page() : scope;
  await scope.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
