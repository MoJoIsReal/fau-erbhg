// The three form flows a parent or council member depends on most — signing
// up for an event, writing to the board, saving a post — driven in a real
// browser against the built site, with the API stubbed per test. Each has one
// success and one refusal; the refusal checks the user is told why and that
// what they typed is still there.
import { CSRF_TOKEN, choose, expect, signInAs, stubApi, t, test } from "./stubs.mjs";

// A date in the near future in Oslo's calendar, so the signup is open
// whatever day the suite runs.
function daysFromNow(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(date);
}

const EVENT = {
  id: 41,
  title: "Sommerfest i barnehagen",
  description: "Grilling og leker for hele familien.",
  date: daysFromNow(14),
  time: "16:00",
  endTime: "18:00",
  location: "Erdal barnehage",
  customLocation: null,
  maxAttendees: 40,
  currentAttendees: 3,
  registrationDeadline: null,
  type: "family",
  status: "active",
  vigiloSignup: false,
  noSignup: false,
  notifyNewsletter: false,
  newsletterSentAt: null,
  potluck: false,
};

test.describe("event signup", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/events", (route) => route.fulfill({ json: [EVENT] }));
    await page.route("**/api/yearly-calendar?**", (route) => route.fulfill({ json: [] }));
  });

  async function openSignup(page) {
    await page.goto("/kalender");
    await page.getByRole("button", { name: t.events.register, exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: t.events.eventRegistration });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(t.events.signupFullName).fill("Kari Nordmann");
    await dialog.getByLabel(t.events.signupEmail).fill("kari@example.test");
    return dialog;
  }

  test("a valid signup is sent once and confirmed", async ({ page }) => {
    const calls = await stubApi(page, "**/api/registrations", "POST", () => ({
      status: 201,
      json: { confirmationEmail: true },
    }));
    const dialog = await openSignup(page);
    await dialog.getByRole("button", { name: t.events.register, exact: true }).click();

    await expect(page.getByText(t.modals.eventRegistration.success).first()).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-csrf-token"]).toBe(CSRF_TOKEN);
    expect(calls[0].body).toMatchObject({
      eventId: EVENT.id,
      name: "Kari Nordmann",
      email: "kari@example.test",
      attendeeCount: 1,
      childrenNames: null,
      language: "no",
    });
  });

  test("an address the server refuses is shown under the email field", async ({ page }) => {
    const calls = await stubApi(page, "**/api/registrations", "POST", () => ({
      status: 400,
      json: { error: "Email address rejected", code: "EMAIL_REJECTED" },
    }));
    const dialog = await openSignup(page);
    await dialog.getByRole("button", { name: t.events.register, exact: true }).click();

    const email = dialog.getByLabel(t.events.signupEmail);
    await expect(dialog.getByText(t.modals.eventRegistration.errors.EMAIL_REJECTED)).toBeVisible();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toBeFocused();
    // Still open, with what the parent typed.
    await expect(dialog.getByLabel(t.events.signupFullName)).toHaveValue("Kari Nordmann");
    expect(calls).toHaveLength(1);
  });
});

test.describe("contact form", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/secure-settings?resource=board-members", (route) => route.fulfill({ json: [] }));
  });

  // The page also holds the newsletter signup, with a name and email of its
  // own, so every lookup stays inside the contact form's section.
  const contactForm = (page) => page.getByRole("region", { name: t.contact.formTitle });

  async function fillMessage(page) {
    await page.goto("/contact");
    const form = contactForm(page);
    await choose(form, t.contact.subject, t.contact.subjects.general);
    await form.getByLabel(t.contact.name).fill("Ola Nordmann");
    await form.getByLabel(t.contact.email).fill("ola@example.test");
    await form.getByLabel(t.contact.message).fill("Når er neste foreldremøte?");
    return form;
  }

  test("a message is sent and the form is cleared", async ({ page }) => {
    const calls = await stubApi(page, "**/api/contact", "POST", () => ({ status: 201, json: { success: true } }));
    const form = await fillMessage(page);
    await form.getByRole("button", { name: t.contact.send }).click();

    await expect(page.getByText(t.contact.success).first()).toBeVisible();
    await expect(form.getByLabel(t.contact.message)).toHaveValue("");
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-csrf-token"]).toBe(CSRF_TOKEN);
    expect(calls[0].body).toMatchObject({
      subject: "general",
      name: "Ola Nordmann",
      email: "ola@example.test",
      message: "Når er neste foreldremøte?",
      language: "no",
    });
  });

  test("an empty form is stopped in the browser", async ({ page }) => {
    const calls = await stubApi(page, "**/api/contact", "POST", () => ({ status: 201, json: { success: true } }));
    await page.goto("/contact");
    const form = contactForm(page);
    await form.getByRole("button", { name: t.contact.send }).click();

    await expect(form.getByText(t.contact.selectSubject)).toBeVisible();
    await expect(form.getByLabel(t.contact.message)).toHaveAttribute("aria-invalid", "true");
    expect(calls).toHaveLength(0);
  });

  test("a refusal is explained and the message is kept", async ({ page }) => {
    await stubApi(page, "**/api/contact", "POST", () => ({
      status: 429,
      json: { error: "Too many requests", code: "RATE_LIMITED" },
    }));
    const form = await fillMessage(page);
    await form.getByRole("button", { name: t.contact.send }).click();

    await expect(page.getByText(t.apiErrors.RATE_LIMITED).first()).toBeVisible();
    await expect(form.getByLabel(t.contact.message)).toHaveValue("Når er neste foreldremøte?");
    await expect(form.getByRole("button", { name: t.contact.send })).toBeEnabled();
  });
});

test.describe("saving a post", () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, "member");
    await page.route("**/api/secure-settings?resource=blog-posts&includeArchived=true", (route) =>
      route.request().method() === "GET" ? route.fulfill({ json: [] }) : route.fallback(),
    );
    await page.route("**/api/secure-settings?resource=board-members", (route) => route.fulfill({ json: [] }));
  });

  async function writePost(page) {
    await page.goto("/content");
    await page.getByRole("button", { name: t.contentPage.newPost }).click();
    await page.getByLabel(t.contentPage.title, { exact: true }).fill("Dugnad i mai");
    const editor = page.getByRole("textbox", { name: t.contentPage.content, exact: true });
    await editor.click();
    await page.keyboard.type("Vi rydder uteområdet lørdag.");
  }

  test("a new post is created once and confirmed", async ({ page }) => {
    const calls = await stubApi(page, "**/api/secure-settings?resource=blog-posts", "POST", (request) => ({
      status: 201,
      json: { id: 7, status: "published", createdAt: "2026-05-01T10:00:00.000Z", updatedAt: "2026-05-01T10:00:00.000Z", ...request.postDataJSON() },
    }));
    await writePost(page);
    const save = page.getByRole("button", { name: t.contentPage.save, exact: true });
    // A double click used to create the post twice (UX-006).
    await save.dblclick();

    await expect(page.getByText(t.contentPage.postHasBeenSaved).first()).toBeVisible();
    expect(calls).toHaveLength(1);
    expect(calls[0].headers["x-csrf-token"]).toBe(CSRF_TOKEN);
    expect(calls[0].body).toMatchObject({ title: "Dugnad i mai", category: "news" });
    expect(calls[0].body.content).toContain("Vi rydder uteområdet lørdag.");
  });

  test("a refused save is explained and the draft stays open", async ({ page }) => {
    await stubApi(page, "**/api/secure-settings?resource=blog-posts", "POST", () => ({
      status: 413,
      json: { error: "Field too large", code: "FIELD_TOO_LARGE" },
    }));
    await writePost(page);
    await page.getByRole("button", { name: t.contentPage.save, exact: true }).click();

    await expect(page.getByText(t.apiErrors.FIELD_TOO_LARGE).first()).toBeVisible();
    await expect(page.getByLabel(t.contentPage.title, { exact: true })).toHaveValue("Dugnad i mai");
    await expect(page.getByRole("textbox", { name: t.contentPage.content, exact: true })).toContainText(
      "Vi rydder uteområdet lørdag.",
    );
  });
});
