import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ProductionOrderDetail } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account and records: users are never deleted, and other files share the app.
const USERNAME = "vrui-una";
const PASSWORD = "vrui una's first password";
const SETUP_TOKEN = "vrui-setup";
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
const report = `table[aria-label='Production variance']`;

// E13-S02: a normal user reads the production variance report, filters it and opens an order, in a real browser.
describe("the production variance report in the UI", () => {
  let admin: Browser;
  let una: Browser;
  let secret: string;
  const ids: Record<"bar" | "cocoa" | "wrapper" | "milk" | "plant" | "done" | "running", string> = {} as never;

  const api = async (method: string, path: string, body?: unknown) => {
    const response = await callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
    expect(response.status, `${method} ${path}`).toBe(200);
    return json(response).data;
  };
  const create = async (path: string, body: unknown) => (await api("POST", path, body)).id as string;
  const order = async (target: string) =>
    ((await api("POST", "/api/tenants/prod/production-orders", { output: ids.bar, location: ids.plant, quantity: target, unit: "each", plannedFinish: "2026-11-02" })) as ProductionOrderDetail).id;
  const complete = (orderId: string, output: string, cocoa: string, wrappers: string, extras: { material: string; quantity: string; unit: string }[] = []) =>
    api("POST", `/api/tenants/prod/production-orders/${orderId}/completions`, {
      quantity: output, unit: "each", components: [{ material: ids.cocoa, quantity: cocoa, unit: "kg" }, { material: ids.wrapper, quantity: wrappers, unit: "each" }, ...extras],
    });
  /** Opens the report at `query` and waits for its table to be shown. */
  const open = async (query: string) => {
    await una.open(`${baseUrl}/admin/prod/reports/variance${query}`);
    await una.waitUntil(shown(report));
  };
  /** Each order row of the shown report: its order cell's first line, and its components as text rows. */
  const rows = () =>
    una.evaluate<{ order: string; output: string; components: string[][] }[]>(`(() => {
      const table = ${shown(report)};
      return [...table.querySelectorAll(":scope > tbody > tr")].map((row) => ({
        order: row.cells[0].querySelector("a").innerText.trim(),
        output: row.cells[1].innerText.replace(/\\s+/g, " ").trim(),
        components: [...row.cells[2].querySelectorAll(":scope tbody tr")].map((line) => [...line.cells].map((cell) => cell.innerText.replace(/\\s+/g, " ").trim())),
      }));
    })()`);

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.bar = await create("/api/tenants/prod/materials", { type: "finished", description: "vrui bar", baseUnit: "each" });
    ids.cocoa = await create("/api/tenants/prod/materials", { type: "raw", description: "vrui cocoa", baseUnit: "kg" });
    ids.wrapper = await create("/api/tenants/prod/materials", { type: "raw", description: "vrui wrapper", baseUnit: "each" });
    ids.milk = await create("/api/tenants/prod/materials", { type: "raw", description: "vrui milk", baseUnit: "kg" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "vrui plant" });
    await api("POST", "/api/tenants/prod/planning-parameters", { material: ids.bar, location: ids.plant, procurement: "make", leadTimeDays: 3, minimumQuantity: "1", lotMultiple: "1" });
    for (const [material, quantity, unit] of [[ids.cocoa, "100", "kg"], [ids.wrapper, "500", "each"], [ids.milk, "10", "kg"]]) {
      await api("POST", "/api/tenants/prod/stock/corrections", { material, location: ids.plant, quantity, unit, reason: "vrui opening" });
    }
    await create("/api/tenants/prod/boms", {
      output: ids.bar, priority: 1, validFrom: "2026-01-01", validThrough: null,
      components: [{ material: ids.cocoa, quantity: "0.5", unit: "kg" }, { material: ids.wrapper, quantity: "2", unit: "each" }],
    });
    ids.done = await order("40");
    await complete(ids.done, "40", "18", "80", [{ material: ids.milk, quantity: "2", unit: "kg" }]);
    ids.running = await order("100");
    await complete(ids.running, "40", "20", "80");
    await complete(ids.running, "0", "3", "0");
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitUntil(signedInAndHydrated(USERNAME));
    await una.setViewport(1280, 800);
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await Promise.all([admin, una].map((browser) => browser.close()));
  });

  it("shows each order's target against produced, and each component's expected, actual, variance and waste (PRD-013, PRD-015, PRD-018)", async () => {
    await open(`?material=${ids.bar}`);

    expect(await una.text("main h1")).toBe("Variance report — Prod");
    expect(await rows()).toEqual([
      {
        order: ids.done,
        output: "Target 40 each Produced 40 each Output variance 0 each Completions 1 Waste postings 0",
        components: [
          [`${ids.cocoa} vrui cocoa`, "20 kg", "18 kg", "-2 kg", "0 kg"],
          [`${ids.wrapper} vrui wrapper`, "80 each", "80 each", "0 each", "0 each"],
          [`${ids.milk} vrui milk Extra`, "0 kg", "2 kg", "+2 kg", "0 kg"],
        ],
      },
      {
        order: ids.running,
        output: "Target 100 each Produced 40 each Output variance -60 each Completions 2 Waste postings 1 Waste",
        components: [
          [`${ids.cocoa} vrui cocoa`, "20 kg", "23 kg", "+3 kg", "3 kg"],
          [`${ids.wrapper} vrui wrapper`, "80 each", "80 each", "0 each", "0 each"],
        ],
      },
    ]);

    // On a phone the output figures move under the order, and the page itself doesn't scroll sideways.
    await una.setViewport(390, 844);
    try {
      await open(`?material=${ids.bar}`);
      expect(await una.evaluate<number>("document.documentElement.scrollWidth")).toBeLessThanOrEqual(390);
      expect(await una.evaluate<string>(`${shown(report)}.querySelector("tbody td [data-report-output]").innerText.replace(/\\s+/g, " ").trim()`)).toBe(
        "Target 40 each Produced 40 each Output variance 0 each Completions 1 Waste postings 0",
      );
      // The components stack under the order too, each figure named, none squeezed into a column.
      expect(await una.evaluate<string>(`${shown(report)}.querySelector("[data-report-stacked='${ids.milk}']").innerText.replace(/\\s+/g, " ").trim()`)).toBe(
        `${ids.milk} vrui milk Extra Expected 0 kg Actual 2 kg Variance +2 kg Waste 0 kg`,
      );
    } finally {
      await una.setViewport(1280, 800);
    }
  });

  it("narrows by state with the filter form, and by date with no output variance under a range", async () => {
    await open(`?material=${ids.bar}`);
    await una.waitUntil(ready(shown("#variance-status")));
    await una.select("#variance-status", "completed");
    await una.click("main form button[type=submit]");
    await una.waitUntil(`location.search.includes("status=completed")`);
    await una.waitUntil(`${shown(report)} && ${shown(report)}.querySelectorAll(":scope > tbody > tr").length === 1`);
    expect((await rows()).map(({ order }) => order)).toEqual([ids.done]);

    await open(`?material=${ids.bar}`);
    await una.waitUntil(ready(shown("#variance-from")));
    expect(await una.fillDate("#variance-from", tomorrow())).toBe(tomorrow());
    await una.click("main form button[type=submit]");
    await una.waitUntil(`location.search.includes("from=${tomorrow()}")`);
    await una.waitForText("No production order with completions matches these filters.");
    await una.waitForText("Output variance needs the whole order");
  });

  it("keeps the form and explains a range that ends before it starts", async () => {
    await una.open(`${baseUrl}/admin/prod/reports/variance?material=${ids.bar}&from=2026-10-22&to=2026-10-21`);
    await una.waitForText("The end date must not be before the start date.");
    expect(await una.evaluate<string | null>(`${shown("#variance-to")}.getAttribute("aria-invalid")`)).toBe("true");
    // The error takes focus, so a screen reader reads it out without the user moving there.
    await una.waitUntil(`document.activeElement?.id === "variance-to-error"`);
    expect(await una.evaluate<boolean>(`!${shown(report)}`)).toBe(true);
  });

  it("opens an order from its row, and still opens while the tenant is read-only (TEN-018)", async () => {
    await open(`?material=${ids.bar}`);
    await una.waitUntil(ready(shown(`a[href='/admin/prod/production-orders/${ids.done}']`)));
    await una.clickRole("link", `Production order ${ids.done}`);
    await una.waitUntil(`location.pathname === "/admin/prod/production-orders/${ids.done}"`);

    expect((await callApi(baseUrl, "PATCH", "/api/tenants/prod", secret, { key: randomUUID(), body: { readOnly: true } })).status).toBe(200);
    try {
      await open(`?material=${ids.milk}`);
      expect((await rows()).map(({ order }) => order)).toEqual([ids.done]);
      await una.waitForText("Prod is read-only");
    } finally {
      expect((await callApi(baseUrl, "PATCH", "/api/tenants/prod", secret, { key: randomUUID(), body: { readOnly: false } })).status).toBe(200);
    }
  });
});
