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

  it("serves the home page with the four MRP II steps", async () => {
    await browser.open(baseUrl);

    expect(await browser.title()).toBe("Caveman Planning Good");
    expect(await browser.text("h1")).toBe("Caveman Planning Good");
    expect(await browser.texts("li h2")).toEqual([
      "Demand Forecast",
      "Bill of Materials",
      "Production Planning",
      "Production Execution",
    ]);
  });

  it("shows a migrated database on the admin page, holding only the admin-password stamp, and both tenants writable", async () => {
    await signInAsAdmin(browser, baseUrl, adminPassword);

    expect(await browser.title()).toBe("Admin · Caveman Planning Good");
    expect(await browser.text("h1")).toBe("Cave control");
    expect(await browser.texts("[data-slot=badge]")).toEqual(["Writable", "Writable", expect.stringMatching(/^Generation [1-9]\d*$/), "26 migrations applied", "0 pending", "1 settings"]);
  });
});
