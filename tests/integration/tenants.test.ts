import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const STRIP = "[role=region][data-tenant]";
const pathname = async (browser: Browser) => new URL(await browser.url()).pathname;
const stripTenant = (browser: Browser) => browser.evaluate<string>(`document.querySelector("${STRIP}").dataset.tenant`);

/**
 * Clicks a link once React has hydrated it: a click on streamed HTML before that can be lost. Next.js
 * keeps earlier pages mounted but hidden, so it waits for the first match that is shown.
 */
async function clickHydrated(browser: Browser, selector: string) {
  const shown = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((link) => link.offsetParent && Object.keys(link).some((key) => key.startsWith("__reactFiber")))`;
  await browser.waitUntil(shown);
  // Mark the shown copy and click exactly it: the first match in the DOM may be a hidden earlier page's.
  await browser.evaluate(`(() => {
    document.querySelectorAll("[data-test-click]").forEach((element) => element.removeAttribute("data-test-click"));
    ${shown}.setAttribute("data-test-click", "");
    return true;
  })()`);
  await browser.click("[data-test-click]");
}

// Spec .ai/specs/2026-10-19--0913UTC-test-prod-tenants.md: TEN-001, TEN-010, TEN-011.
describe("tenants in the admin", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(() => browser.close());

  it("keeps tenant pages behind sign-in", async () => {
    await browser.open(`${baseUrl}/admin/test`);
    await browser.waitFor("#username");

    expect(await pathname(browser)).toBe("/login");
  });

  it("lands the admin on the Global chooser, offering both tenants (TEN-001)", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(await pathname(browser)).toBe("/admin");
    expect(await stripTenant(browser)).toBe("global");
    expect(await browser.text(STRIP)).toContain("Global — no tenant selected");
    expect(await browser.texts("nav[aria-label='Choose a tenant'] a")).toEqual([
      expect.stringContaining("Open Test"),
      expect.stringContaining("Open Prod"),
    ]);
  });

  it("opens Test with its strip, title and generation (TEN-011)", async () => {
    await clickHydrated(browser, "nav[aria-label='Choose a tenant'] a[href='/admin/test']");
    await browser.waitFor("[data-slot=card-description]");

    expect(await pathname(browser)).toBe("/admin/test");
    expect(await stripTenant(browser)).toBe("test");
    expect(await browser.text(STRIP)).toContain("Test tenant — demonstration data, safe to experiment");
    expect(await browser.title()).toBe("Test · Admin · Caveman Planning Good");
    expect(await browser.text("[data-slot=card-description]")).toBe("Dataset generation 1");
    expect(await browser.text("main")).toContain("No business records yet");
  });

  it("switches to Prod and back without any other step (TEN-010)", async () => {
    await clickHydrated(browser, `${STRIP} a[href='/admin/prod']`);
    await browser.waitFor(`${STRIP}[data-tenant=prod]`);

    expect(await pathname(browser)).toBe("/admin/prod");
    expect(await browser.text(STRIP)).toContain("Prod tenant — live data");
    expect(await browser.title()).toBe("Prod · Admin · Caveman Planning Good");
    expect(await browser.evaluate<string>(`document.querySelector("${STRIP} a[aria-current=page]").textContent`)).toBe(
      "Prod",
    );

    await clickHydrated(browser, `${STRIP} a[href='/admin/test']`);
    // The shown strip: Next.js keeps the earlier pages' strips mounted but hidden.
    await browser.waitUntil(`[...document.querySelectorAll("${STRIP}")].find((strip) => strip.offsetParent)?.dataset.tenant === "test"`);
    expect(await pathname(browser)).toBe("/admin/test");
  });

  // Partial Prefetching serves the route's App Shell (status 200) before the layout's notFound() runs,
  // so Next.js streams its 404 UI with a noindex tag instead of a 404 status
  // (node_modules/next/dist/docs/01-app/02-guides/streaming.md, "The HTTP contract").
  it.each(["staging", "TEST"])("answers the unknown tenant %s with the not-found page and no strip", async (tenant) => {
    const html = await (await fetch(`${baseUrl}/admin/${tenant}`)).text();
    expect(html).toContain('<meta name="robots" content="noindex"/>');

    await browser.open(`${baseUrl}/admin/${tenant}`);
    await browser.waitFor("h2");
    expect(await browser.text("h2")).toBe("This page could not be found.");
    expect(await browser.evaluate<boolean>(`document.querySelector("${STRIP}") === null`)).toBe(true);
  });
});

// API-013, API-034: tenant metadata, and the tenant always named in the path.
describe("the tenant API", () => {
  let browser: Browser;
  /** Calls the API from the signed-in page, so the session cookie goes along. */
  const api = (path: string) =>
    browser.evaluate<{ status: number; body: unknown }>(
      `fetch(${JSON.stringify(path)}).then(async (r) => ({ status: r.status, body: await r.json() }))`,
    );

  beforeAll(async () => {
    browser = openBrowser();
    await signInAsAdmin(browser, baseUrl, adminPassword);
  });
  afterAll(() => browser.close());

  it("lists both tenants with their generation", async () => {
    expect(await api("/api/tenants")).toEqual({
      status: 200,
      body: {
        ok: true,
        data: [
          { code: "test", name: "Test", generation: 1 },
          { code: "prod", name: "Prod", generation: 1 },
        ],
      },
    });
  });

  it("reads one tenant by its path", async () => {
    expect(await api("/api/tenants/prod")).toEqual({
      status: 200,
      body: { ok: true, data: { code: "prod", name: "Prod", generation: 1 } },
    });
  });

  it("rejects a tenant that doesn't exist", async () => {
    expect(await api("/api/tenants/staging")).toEqual({
      status: 404,
      body: { ok: false, error: { code: "TENANT_NOT_FOUND", message: "Unknown tenant." } },
    });
  });

  it.each(["/api/tenants", "/api/tenants/test"])("refuses %s without a session", async (path) => {
    const response = await fetch(`${baseUrl}${path}`);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: false, error: { code: "UNAUTHORIZED", message: "You need to sign in." } });
  });
});
