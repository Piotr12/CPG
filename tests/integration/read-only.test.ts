import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and nothing here is ever deleted.
const REFUSED = "ro-ui refused";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
/** The read-only banner that is shown, if any: Next.js keeps earlier pages mounted but hidden. */
const shownBanner = `[...document.querySelectorAll("[data-read-only-banner]")].find((banner) => banner.offsetParent)`;
/** The tenant header row that is shown: the banner streams in under it. */
const shownHeader = `[...document.querySelectorAll("[role=region][data-tenant]")].find((row) => row.offsetParent)`;
/** Whether a side of the switch in `bar` (the sidebar, or the top bar below 768 px) shows the lock and says read-only. */
const lockedSide = (bar: string, name: string) =>
  `(() => {
    const side = document.querySelector(${JSON.stringify(`${bar} [data-tenant-switch] [aria-label="${name} (read-only)"]`)});
    const lock = side?.querySelector("[data-read-only]");
    return Boolean(lock && lock.getBoundingClientRect().width > 0);
  })()`;
const anyLock = `Boolean(document.querySelector("[data-tenant-switch] [data-read-only]"))`;

/** Opens a tenant's materials list and waits until it is shown. */
async function openMaterials(browser: Browser, tenant: string) {
  await browser.open(`${baseUrl}/admin/${tenant}/materials`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
}

/**
 * Sets a tenant's flag from the Read-only card on Cave control, unless it is already set that way,
 * and waits until the card shows the new state.
 */
async function setReadOnly(admin: Browser, name: string, readOnly: boolean) {
  const open = readOnly ? `Make ${name} read-only` : `Make ${name} writable`;
  const done = readOnly ? `Make ${name} writable` : `Make ${name} read-only`;
  await admin.open(`${baseUrl}/admin`);
  await admin.waitUntil(`${ready(button(open))} || ${ready(button(done))}`);
  if (await admin.evaluate<boolean>(`Boolean(${button(done)})`)) return;
  await admin.clickRole("button", open);
  await admin.waitFor("[role=alertdialog]");
  await admin.clickRole("button", readOnly ? "Make read-only" : "Make writable");
  await admin.waitUntil(`!document.querySelector("[role=alertdialog]") && ${ready(button(done))}`);
}

// Read-only tenants on the screens (spec .ai/specs/implemented/2026-10-19--2018UTC-read-only-tenants.md):
// TEN-016, TEN-018, TEN-021, AUD-016.
describe("read-only tenants on the screens (R05)", () => {
  let admin: Browser;
  let stale: Browser;

  beforeAll(async () => {
    [admin, stale] = [openBrowser(), openBrowser()];
    await Promise.all([signInAsAdmin(admin, baseUrl, adminPassword), signInAsAdmin(stale, baseUrl, adminPassword)]);
  });
  afterAll(async () => {
    try {
      // Later files write to Prod: leave it writable even when a test failed half-way.
      await setReadOnly(admin, "Prod", false);
    } finally {
      await Promise.all([admin, stale].map((browser) => browser.close()));
    }
  });

  it("makes Prod read-only from Cave control, and the chooser says so", async () => {
    // A page loaded while Prod was still writable, kept open for the next test.
    await openMaterials(stale, "prod");
    await stale.waitUntil(ready(button("Create material")));

    await setReadOnly(admin, "Prod", true);

    const chooser = await admin.evaluate<string[]>(
      `[...document.querySelectorAll("main nav a")].map((link) => link.innerText.replace(/\\s+/g, " ").trim())`,
    );
    expect(chooser).toEqual(["Test Demonstration data, safe to experiment Open Test →", "Prod Live data Read-only Open Prod →"]);
  });

  it("refuses the admin's write from a page loaded before the flag, and keeps what was stored (TEN-016)", async () => {
    await stale.clickRole("button", "Create material");
    await stale.select("[role=dialog] select[name=type]", "raw");
    await stale.fillLabel("Description", REFUSED);
    await stale.fillLabel("Base unit", "kg");
    await stale.click("[role=dialog] button[type=submit]");
    await stale.waitFor("[role=dialog] [role=alert]");

    expect(await stale.text("[role=dialog] [role=alert]")).toBe(
      "This tenant is read-only, so its business data can't be changed. The administrator can make it writable on the Cave control page.",
    );
    await openMaterials(admin, "prod");
    expect(await admin.evaluate<string>(`document.querySelector("main table").innerText`)).not.toContain(REFUSED);
  });

  it("labels Prod read-only on its pages and offers no write control, while Test stays writable (TEN-018, TEN-021)", async () => {
    await openMaterials(admin, "prod");
    await admin.waitUntil(`Boolean(${shownBanner}) && ${shownHeader}?.dataset.tenant === "prod"`);

    expect(await admin.evaluate<string>(`${shownBanner}.innerText.replace(/\\s+/g, " ").trim()`)).toBe(
      "Prod is read-only — business changes are blocked. Reading, the audit, preferences and user management still work. Change on Tenants",
    );
    expect(await admin.evaluate<string>(`${shownBanner}.getAttribute("role")`)).toBe("status");
    expect(await admin.evaluate<string>(`${shownBanner}.querySelector("a").getAttribute("href")`)).toBe("/admin");
    expect(await admin.evaluate<boolean>(lockedSide("[data-slot=sidebar]", "Prod"))).toBe(true);
    expect(await admin.evaluate<string>(`document.querySelector("[data-slot=sidebar] nav").innerText`)).toContain(
      "Read-only — business changes are blocked",
    );
    expect(await admin.evaluate<boolean>(`Boolean(${button("Create material")})`)).toBe(false);

    await openMaterials(admin, "test");
    await admin.waitUntil(ready(button("Create material")));
    expect(await admin.evaluate<boolean>(`Boolean(${shownBanner})`)).toBe(false);
    // Test's side stays unlocked; Prod's keeps its lock from any page.
    expect(await admin.evaluate<boolean>(lockedSide("[data-slot=sidebar]", "Test"))).toBe(false);
    expect(await admin.evaluate<boolean>(lockedSide("[data-slot=sidebar]", "Prod"))).toBe(true);
  });

  it("shows the lock on the top bar's switch at 390 px, with nothing sticking out", async () => {
    try {
      await admin.setViewport(390, 844);
      await openMaterials(admin, "prod");
      await admin.waitUntil(`Boolean(${shownBanner})`);

      expect(await admin.evaluate<boolean>(lockedSide("[data-mobile-bar]", "Prod"))).toBe(true);
      expect(await admin.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    } finally {
      await admin.setViewport(1280, 720);
    }
  });

  it("keeps the change in the Global audit (AUD-016)", async () => {
    await admin.open(`${baseUrl}/admin/audit`);
    await admin.waitUntil(`[...document.querySelectorAll("main tbody tr")].some((row) => !row.closest("[hidden]"))`);

    const newest = await admin.evaluate<string>(`document.querySelector("main tbody tr").innerText.replace(/\\s+/g, " ")`);
    expect(newest).toContain("Read-only flag changed");
    expect(newest).toContain("Prod");
    expect(newest).toContain("read-only: no → yes");
  });

  it("gives Create material back once Prod is writable again", async () => {
    await setReadOnly(admin, "Prod", false);

    await openMaterials(admin, "prod");
    await admin.waitUntil(ready(button("Create material")));
    expect(await admin.evaluate<boolean>(`Boolean(${shownBanner})`)).toBe(false);
    expect(await admin.evaluate<boolean>(anyLock)).toBe(false);
  });
});
