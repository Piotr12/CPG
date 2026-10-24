import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const MESSAGE = "Page not found.";
const REASON = "The address may be mistyped, or the record belongs to the other tenant.";

/** The shown not-found message's way back: its one link (Next keeps earlier pages mounted but hidden). */
const wayBack = `[...document.querySelectorAll("main a")].find((link) => link.offsetParent)`;
/** True once the not-found message has streamed in and is shown, not still in a hidden Suspense slot. */
const messageShown = `[...document.querySelectorAll("main p")].some((p) => p.textContent === ${JSON.stringify(MESSAGE)} && p.offsetParent && !p.closest("[hidden]"))`;

/**
 * Design system v1, "States and copy → Not found". With Partial Prefetching a `notFound()` streams
 * after a 200 (lesson 2026-10-19), so these assert the page and its `noindex`, never the status.
 */
describe("the not-found pages", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(() => browser.close());

  const noindex = () =>
    browser.evaluate<boolean>(`[...document.querySelectorAll("meta[name=robots]")].some((meta) => meta.content.includes("noindex"))`);

  it("answers an unknown address inside the shell, explains, and leads to Tenants", async () => {
    const html = await (await fetch(`${baseUrl}/this-page-does-not-exist`)).text();
    expect(html).toContain('<meta name="robots" content="noindex"/>');

    await browser.open(`${baseUrl}/this-page-does-not-exist`);
    await browser.waitUntil(messageShown);

    expect(await browser.text("main")).toContain(REASON);
    expect(await browser.evaluate<[string, string]>(`[${wayBack}.textContent, ${wayBack}.getAttribute("href")]`)).toEqual([
      "Go to Tenants",
      "/admin",
    ]);
    expect(await browser.title()).toBe("Page not found · Caveman Planning Good");
    expect(await noindex()).toBe(true);
  });

  it("answers a record the tenant doesn't have under the tenant's header, leading back to its list", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);
    await browser.open(`${baseUrl}/admin/test/materials/99999999`);
    await browser.waitUntil(`${messageShown} && ${wayBack}?.textContent === "Back to Materials"`);

    expect(await browser.text("main")).toContain(REASON);
    expect(await browser.evaluate<string>(`${wayBack}.getAttribute("href")`)).toBe("/admin/test/materials");
    // The tenant layout stays: its header row still names the tenant.
    expect(await browser.evaluate<string>(`document.querySelector("[role=region][data-tenant]")?.dataset.tenant ?? ""`)).toBe("test");
    expect(await noindex()).toBe(true);
  });
});
