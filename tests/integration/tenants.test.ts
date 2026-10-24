import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { hydrated, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

/** The tenant header row (TEN-011). Next.js keeps earlier pages' rows mounted but hidden: read the shown one. */
const HEADER = "[role=region][data-tenant]";
const shownHeader = `[...document.querySelectorAll("${HEADER}")].find((row) => row.offsetParent)`;
const pathname = async (browser: Browser) => new URL(await browser.url()).pathname;
const headerTenant = (browser: Browser) => browser.evaluate<string>(`${shownHeader}.dataset.tenant`);
/** The row's accessible name: its tag, then its streamed words. */
const headerName = (browser: Browser) =>
  browser.evaluate<string>(
    `${shownHeader}.getAttribute("aria-labelledby").split(" ").map((id) => document.getElementById(id).textContent).join(" ")`,
  );
/** The TEST | PROD switch at the top of the sidebar. */
const SWITCH = "[data-slot=sidebar] [data-tenant-switch]";

// Spec .ai/specs/implemented/2026-10-19--0913UTC-test-prod-tenants.md: TEN-001, TEN-010, TEN-011.
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
    await browser.waitUntil(`${shownHeader}?.textContent.includes("Shared by Test and Prod")`);
    expect(await headerTenant(browser)).toBe("global");
    expect(await headerName(browser)).toBe("GLOBAL Shared by Test and Prod — switching tenant doesn't change this page");
    expect(await browser.texts("nav[aria-label='Choose a tenant'] a")).toEqual([
      expect.stringContaining("Open Test"),
      expect.stringContaining("Open Prod"),
    ]);
  });

  it("opens Test with its header row, title and generation (TEN-011)", async () => {
    await clickHydrated(browser, "nav[aria-label='Choose a tenant'] a[href='/admin/test']");
    // /admin has a card description too: wait for Test's page before reading anything.
    await browser.waitUntil(`${shownHeader}?.dataset.tenant === "test" && ${shownHeader}.textContent.includes("Active tenant")`);
    await browser.waitFor("[data-slot=card-description]");

    expect(await pathname(browser)).toBe("/admin/test");
    expect(await headerName(browser)).toBe("TEST Active tenant");
    expect(await browser.title()).toBe("Test · Admin · Caveman Planning Good");
    const generation = await browser.evaluate<number>(`fetch("/api/tenants/test").then(r=>r.json()).then(result=>result.data.generation)`);
    expect(await browser.text("[data-slot=card-description]")).toBe(`Dataset generation ${generation}`);
    expect(await browser.text("main")).toContain("Materials");
  });

  it("switches to Prod and back without any other step (TEN-010)", async () => {
    await clickHydrated(browser, `${SWITCH} a[href='/admin/prod']`);
    await browser.waitUntil(`${shownHeader}?.dataset.tenant === "prod" && ${shownHeader}.textContent.includes("Active tenant")`);

    expect(await pathname(browser)).toBe("/admin/prod");
    expect(await headerName(browser)).toBe("PROD Active tenant");
    expect(await browser.title()).toBe("Prod · Admin · Caveman Planning Good");
    expect(await browser.evaluate<string>(`document.querySelector("${SWITCH} a[aria-current=page]").textContent`)).toBe("Prod");

    await clickHydrated(browser, `${SWITCH} a[href='/admin/test']`);
    await browser.waitUntil(`${shownHeader}?.dataset.tenant === "test"`);
    expect(await pathname(browser)).toBe("/admin/test");
  });

  // Partial Prefetching serves the route's App Shell (status 200) before the layout's notFound() runs,
  // so Next.js streams its 404 UI with a noindex tag instead of a 404 status
  // (node_modules/next/dist/docs/01-app/02-guides/streaming.md, "The HTTP contract").
  it.each(["staging", "TEST"])("answers the unknown tenant %s with the not-found page and no header row", async (tenant) => {
    const html = await (await fetch(`${baseUrl}/admin/${tenant}`)).text();
    expect(html).toContain('<meta name="robots" content="noindex"/>');

    await browser.open(`${baseUrl}/admin/${tenant}`);
    // The root not-found page (design system v1, "States and copy → Not found") replaces Next's default text.
    await browser.waitForText("Page not found.");
    expect(await browser.evaluate<string>(`document.querySelector("main a[href='/admin']")?.textContent ?? ""`)).toBe("Go to Tenants");
    expect(await browser.evaluate<boolean>(`document.querySelector("${HEADER}") === null`)).toBe(true);
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

  it("lists both tenants with their generation and read-only flag", async () => {
    expect(await api("/api/tenants")).toEqual({
      status: 200,
      body: {
        ok: true,
        data: [
          { code: "test", name: "Test", generation: expect.any(Number), readOnly: false },
          { code: "prod", name: "Prod", generation: 1, readOnly: false },
        ],
      },
    });
  });

  it("reads one tenant by its path", async () => {
    expect(await api("/api/tenants/prod")).toEqual({
      status: 200,
      body: { ok: true, data: { code: "prod", name: "Prod", generation: 1, readOnly: false } },
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

// Design system v1 (spec 2026-10-24--0842UTC): the tenant on its own tokens, the trail's way back to a list.
describe("the tenant shell", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = openBrowser();
    await browser.setViewport(1280, 800);
    await signInAsAdmin(browser, baseUrl, adminPassword);
  });
  afterAll(() => browser.close());

  it("offers each tenant on a card carrying its TEST or PROD tag", async () => {
    await browser.open(`${baseUrl}/admin`);
    // The page streams into a hidden container first: read it once it is in main.
    await browser.waitUntil(`document.querySelectorAll("main nav[aria-label='Choose a tenant'] [data-tenant-choice] [data-tenant-tag]").length === 2`);

    expect(
      await browser.evaluate(
        `[...document.querySelectorAll("main nav[aria-label='Choose a tenant'] [data-tenant-choice]")].map((card) => [card.getAttribute("href"), card.querySelector("[data-tenant-tag]").innerText])`,
      ),
    ).toEqual([
      ["/admin/test", "TEST"],
      ["/admin/prod", "PROD"],
    ]);
    expect(await browser.text("main h1")).toBe("Tenants");
  });

  it("keeps the TEST tag in view beside the icon rail at 768 px (TEN-011)", async () => {
    await browser.setViewport(768, 800);
    try {
      await browser.open(`${baseUrl}/admin/test/materials`);
      await browser.waitUntil(`document.querySelector("[data-slot=sidebar]")?.dataset.state === "collapsed" && ${shownHeader}?.textContent.includes("Materials")`);

      expect(
        await browser.evaluate(`(() => {
          const tag = ${shownHeader}.querySelector("[data-tenant-tag]");
          const box = tag.getBoundingClientRect();
          return { text: tag.innerText, inView: box.width > 0 && box.right <= innerWidth && box.bottom <= innerHeight };
        })()`),
      ).toEqual({ text: "TEST", inView: true });
      expect(await browser.evaluate<string>(`document.querySelector("${SWITCH} [aria-current=page]").getAttribute("aria-label")`)).toBe("Test");
    } finally {
      await browser.setViewport(1280, 800);
    }
  });

  it("shows a record in the trail and links back to its list, in reach at 320 px", async () => {
    const trail = `${shownHeader}?.querySelector("nav")`;
    const listLink = `${trail}?.querySelector("a[href='/admin/test/materials']")`;
    await browser.setViewport(320, 800);
    try {
      await browser.open(`${baseUrl}/admin/test/materials/00000001`);
      await browser.waitUntil(hydrated(listLink));

      expect(
        await browser.evaluate(`(() => {
          const current = ${trail}.querySelector("[aria-current=page]");
          const box = ${listLink}.getBoundingClientRect();
          return {
            steps: [...${trail}.querySelectorAll("li[data-slot=breadcrumb-item]")].map((item) => item.innerText),
            record: [current.textContent, current.classList.contains("font-mono")],
            linkInView: box.left >= 0 && box.right <= innerWidth,
            pageFits: document.documentElement.scrollWidth <= innerWidth,
          };
        })()`),
      ).toEqual({ steps: ["Master data", "Materials", "00000001"], record: ["00000001", true], linkInView: true, pageFits: true });

      await clickHydrated(browser, "[role=region][data-tenant] nav a[href='/admin/test/materials']");
      await browser.waitUntil(`location.pathname === "/admin/test/materials" && ${trail}?.querySelector("[aria-current=page]")?.textContent === "Materials"`);
      expect(await pathname(browser)).toBe("/admin/test/materials");
    } finally {
      await browser.setViewport(1280, 800);
    }
  });
});
