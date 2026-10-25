import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

describe("a fresh app instance", () => {
  let browser: Browser;

  beforeAll(() => {
    browser = openBrowser();
  });
  afterAll(() => browser.close());

  it("passes the health check", async () => {
    const response = await fetch(`${baseUrl}/up`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
  });

  it("serves the home page with the flow of what is built, each step linked to its help topic", async () => {
    await browser.open(baseUrl);

    expect(await browser.title()).toBe("Caveman Planning Good");
    expect(await browser.text("h1")).toBe("Caveman Planning Good");
    expect(await browser.texts("ol[aria-label='What CPG covers'] a")).toEqual([
      "Forecasts and customer orders",
      "BOMs",
      "Production and purchase orders",
      "Stock",
    ]);
  });

  it("shows a migrated database on the admin page, holding only the admin-password stamp, and both tenants writable", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(await browser.title()).toBe("Admin · Caveman Planning Good");
    expect(await browser.text("h1")).toBe("Tenants");
    // Design system v1: a tenant's access is a status (icon + label), the counts stay category tags.
    expect(await browser.texts("[data-slot=status-badge]")).toEqual(["Writable", "Writable"]);
    expect(await browser.texts("[data-slot=badge]")).toEqual([expect.stringMatching(/^Generation [1-9]\d*$/), "32 migrations applied", "0 pending", "1 settings"]);
  });
});
