import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { choosePreference, closeAccountMenu, restoreDefaultPreferences, signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const password = inject("adminPassword");
const normalName = `reset-ui-${randomUUID().slice(0, 8)}`;

describe("Test reset in Cave control", () => {
  let admin: Browser;
  let stale: Browser;
  let normal: Browser;
  let secret: string;
  /** The Test customer order this file adds before a reset. */
  let extraOrder: string;
  const api = (method: string, path: string, body?: unknown, generation?: number) => callApi(baseUrl, method, path, secret, { key: randomUUID(), body, generation });
  const state = async () => json(await api("GET", "/api/tenants/test")).data as { generation: number; readOnly: boolean };
  async function openControl(browser: Browser) {
    await browser.open(`${baseUrl}/admin`);
    await browser.waitUntil(`!!document.querySelector('[data-test-reset] button') && document.querySelector('[data-test-reset] button').offsetParent && Object.keys(document.querySelector('[data-test-reset] button')).some(k=>k.startsWith('__reactFiber'))`);
  }
  const confirm = async (browser: Browser, name = "Reset Test") => {
    await browser.click(`[role=alertdialog] button[data-variant=destructive]`);
    await browser.waitUntil(`!document.querySelector('[role=alertdialog]') && !!document.querySelector('[data-test-reset] [role=status]')`);
    expect(await browser.text("[data-test-reset] [role=status]")).toContain(name === "Reset Test" ? "Test reset to generation" : "Test zresetowano do generacji");
  };

  beforeAll(async () => {
    admin = openBrowser(); stale = openBrowser(); normal = openBrowser();
    await signInAsAdmin(admin, baseUrl, password);
    await signInAsAdmin(stale, baseUrl, password);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, "reset-ui-admin");
    expect((await api("POST", "/api/users", { username: normalName, password: "reset ui normal password" })).status).toBe(200);
    await signInAs(normal, baseUrl, normalName, "reset ui normal password");
  });
  afterAll(async () => {
    try {
      await restoreDefaultPreferences(admin, baseUrl, password);
      await closeAccountMenu(admin);
      await api("PATCH", "/api/tenants/test", { readOnly: false });
      const tokens = json(await api("GET", "/api/tokens")).data as { id: string; name: string }[];
      const own = tokens.find((token) => token.name === "reset-ui-admin");
      if (own) await api("DELETE", `/api/tokens/${own.id}`);
    } finally { await Promise.all([admin, stale, normal].map((browser) => browser.close())); }
  });

  it("hides reset from a normal user, offers tiny by default and warns of realistic's wait, and cancellation changes nothing", async () => {
    await normal.open(`${baseUrl}/admin`);
    await normal.waitForText("Cave control");
    expect(await normal.evaluate<boolean>(`!!document.querySelector('[data-test-reset]')`)).toBe(false);
    await api("PATCH", "/api/tenants/test", { readOnly: false });
    const before = await state();
    await openControl(admin);
    await clickHydrated(admin, "[data-test-reset] button");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog]")).toContain(`generation ${before.generation}`);
    expect(await admin.text("[role=alertdialog]")).toContain("the tiny demonstration dataset");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]") && !document.querySelector("[data-slot=alert-dialog-overlay]")`);
    // Realistic is the admin's deliberate choice: the confirmation says what it costs. This file never confirms it
    // (it takes longer than a browser wait on CI); test-reset-realistic.test.ts resets to it through the API.
    await admin.select("[data-test-reset] select", "realistic");
    await clickHydrated(admin, "[data-test-reset] button");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog]")).toContain("the realistic demonstration dataset");
    expect(await admin.text("[role=alertdialog]")).toContain("takes up to half a minute");
    await admin.clickRole("button", "Cancel");
    expect(await state()).toEqual(before);
  });

  it("resets writable Test and records the acting UI session (TEN-022, AUD-013, API-017)", async () => {
    const before = await state();
    // Records of this file's own, so the reset visibly replaces what Test held.
    const extra = await api("POST", "/api/tenants/test/materials", { type: "raw", description: "reset-ui extra", baseUnit: "kg" }, before.generation);
    expect(extra.status).toBe(200);
    const order = await api("POST", "/api/tenants/test/customer-orders", {
      customer: "00000001", location: "00000001", lines: [{ material: "00000005", quantity: "1", unit: "each", requiredDate: "2030-01-02" }],
    }, before.generation);
    expect(order.status).toBe(200);
    extraOrder = json(order).data.id as string;
    await openControl(admin);
    await clickHydrated(admin, "[data-test-reset] button");
    await admin.waitFor("[role=alertdialog]");
    await confirm(admin);
    expect(await state()).toEqual({ ...before, code: "test", name: "Test", generation: before.generation + 1, readOnly: false });
    const events = json(await api("GET", "/api/audit?limit=100")).data.entries as { action: string; channel: string; sessionId: string | null; actor: { username: string } }[];
    expect(events.find(({ action }) => action === "tenants.tenant.reset")).toMatchObject({ channel: "ui", actor: { username: "admin" }, sessionId: expect.any(String), after: { dataset: "tiny" } });
  });

  it("leaves Test with the tiny dataset after the reset: its 26 materials, and less than a page of customer orders from 00000001 again (TEN-022)", async () => {
    await admin.open(`${baseUrl}/admin/test/materials`);
    await admin.waitUntil(`!!document.querySelector("main table tbody tr") && !document.querySelector("main table").closest("[hidden]")`);
    const materials = await admin.evaluate<string[][]>(
      `[...document.querySelectorAll("main table tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
    );
    expect(materials).toHaveLength(26);
    expect(materials.map(([id]) => id)).toEqual(Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(8, "0")));
    expect(materials.flat()).not.toContain("reset-ui extra");
    expect(json(await api("GET", "/api/tenants/test/materials")).data).toHaveLength(26);
    const orders = json(await api("GET", "/api/tenants/test/customer-orders")).data as { id: string }[];
    expect(orders[0].id).toBe("00000001");
    expect(orders.length).toBeLessThan(100);
    // The order added before the reset is gone: the regenerated orders stop before its ID.
    expect((await api("GET", `/api/tenants/test/customer-orders/${extraOrder}`)).status).toBe(404);
  });

  it("refuses both an old business edit and an old reset confirmation after a real reset (TEN-030, API-034)", async () => {
    await stale.open(`${baseUrl}/admin/test/materials/00000001`);
    await stale.waitUntil(`!![...document.querySelectorAll('main button')].find(b=>b.offsetParent && b.textContent.trim()==='Edit' && Object.keys(b).some(k=>k.startsWith('__reactFiber')))`);
    await stale.clickRole("button", "Edit");
    await stale.fillLabel("Description", "must never cross a reset");
    const before = await state();
    await openControl(admin);
    await clickHydrated(admin, "[data-test-reset] button");
    await admin.waitFor("[role=alertdialog]");
    expect((await api("POST", "/api/tenants/test/reset", {}, before.generation)).status).toBe(200);
    await admin.click("[role=alertdialog] button[data-variant=destructive]");
    await admin.waitFor("[role=alertdialog] [role=alert]");
    expect(await admin.text("[role=alertdialog] [role=alert]")).toContain("Test was reset since this page loaded");
    expect(await admin.text("[role=alertdialog]")).toContain(`generation ${before.generation}`);
    expect((await state()).generation).toBe(before.generation + 1);
    await stale.click("[role=dialog] button[type=submit]");
    await stale.waitFor("[role=dialog] [role=alert]");
    expect(await stale.text("[role=dialog] [role=alert]")).toContain("data was reset");
    expect(json(await api("GET", "/api/tenants/test/materials/00000001")).data.description).toBe("Steel sheet 2 mm");
    await admin.clickRole("button", "Cancel");
  });

  it("resets read-only Test in Polish/dark mode at 390px and retains its flag (TEN-023)", async () => {
    await api("PATCH", "/api/tenants/test", { readOnly: true });
    await openControl(admin);
    await choosePreference(admin, "pl");
    await choosePreference(admin, "dark");
    await closeAccountMenu(admin);
    await admin.setViewport(390, 844);
    await openControl(admin);
    await admin.waitUntil(`document.documentElement.lang==='pl' && document.documentElement.classList.contains('dark')`);
    const before = await state();
    await clickHydrated(admin, "[data-test-reset] button");
    await admin.waitFor("[role=alertdialog]");
    expect(await admin.text("[role=alertdialog]")).toContain("Tej operacji nie można cofnąć");
    expect(await admin.evaluate<boolean>(`(() => { const b=document.querySelector('[role=alertdialog] button[data-variant=destructive]').getBoundingClientRect(); return b.x>=0 && b.right<=innerWidth && b.bottom<=innerHeight })()`)).toBe(true);
    await confirm(admin, "Resetuj Test");
    expect(await state()).toMatchObject({ generation: before.generation + 1, readOnly: true });
    expect(await admin.text("[data-test-reset] [role=status]")).toContain("Test pozostanie tylko do odczytu");
  });
});
