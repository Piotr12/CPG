import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: users are never deleted, and other files share the app.
const USERNAME = "mrpui-uma";
const PASSWORD = "mrpui uma's first password";
const SETUP_TOKEN = "mrpui-setup";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
/** True once the shown `selector` is hydrated, so a click reaches React (lesson 2026-10-23). */
const ready = (selector: string) => `Boolean(${shown(selector)}) && Object.keys(${shown(selector)}).some((key) => key.startsWith("__reactFiber"))`;
const RUN_BUTTON = "main button[data-mrp-run]";
const field = (key: string) => `main [data-mrp-field=${key}]`;
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// E14-S02 in a real browser: a user runs MRP from the MRP page and sees the run (RUN-002); nothing else
// starts one (RUN-001); a read-only tenant keeps the latest run readable and offers no Run (RUN-021, TEN-019).
describe("the MRP page", () => {
  let admin: Browser;
  let uma: Browser;
  let secret: string;
  let umaSecret: string;

  const api = (method: string, path: string, body?: unknown, token = secret) =>
    callApi(baseUrl, method, path, token, body === undefined ? {} : { key: randomUUID(), body });
  const created = async (path: string, body: unknown) => json(await api("POST", path, body)).data.id as string;
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", { readOnly });
  const latest = async () => json(await api("GET", "/api/tenants/prod/mrp/runs/latest", undefined, umaSecret)).data as MrpLatestView;
  /** Opens the Prod MRP page in `browser` and waits for its header. */
  const open = async (browser: Browser) => {
    await browser.open(`${baseUrl}/admin/prod/mrp`);
    await browser.waitUntil(`Boolean(${shown("main h1")})`);
  };
  const text = (browser: Browser, key: string) => browser.evaluate<string>(`${shown(field(key))}?.textContent ?? ""`);

  beforeAll(async () => {
    [admin, uma] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    expect((await api("POST", "/api/users", { username: USERNAME, password: PASSWORD })).status).toBe(200);
    await signInAs(uma, baseUrl, USERNAME, PASSWORD);
    await openTokens(uma, baseUrl);
    umaSecret = await createToken(uma, "mrpui-uma-cli");
    // Something for the run to plan, whatever other files left in Prod.
    const material = await created("/api/tenants/prod/materials", { type: "finished", description: "mrpui shelf", baseUnit: "each" });
    const location = await created("/api/tenants/prod/locations", { name: "mrpui plant" });
    await api("POST", "/api/tenants/prod/stock/corrections", { material, location, quantity: "8", unit: "each", reason: "mrpui count" });
  });
  afterAll(async () => {
    try {
      // Later files write to Prod, and expect the admin to hold no tokens.
      expect((await setReadOnly(false)).status).toBe(200);
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    } finally {
      await Promise.all([admin, uma].map((browser) => browser.close()));
    }
  });

  it("lets a normal user run MRP and shows the new run's ID, time and account, as the API returns it with its results (RUN-002)", async () => {
    await open(uma);
    await uma.waitUntil(ready(RUN_BUTTON));
    const before = await text(uma, "id");

    await uma.click(RUN_BUTTON);
    await uma.waitUntil(`(${shown(field("id"))}?.textContent ?? "") !== ${JSON.stringify(before)} && !${shown(RUN_BUTTON)}.disabled`);

    const id = await text(uma, "id");
    expect(id).toMatch(/^\d{8}$/);
    expect(await text(uma, "time")).toMatch(new RegExp(`^${day(0)} \\d\\d:\\d\\d UTC$`));
    expect(await text(uma, "account")).toBe(`${USERNAME} · UI`);
    expect(await text(uma, "days")).toBe(`${day(0)} – ${day(89)} (90 days)`);
    const { run, total, plans } = await latest();
    expect(run).toMatchObject({ id, account: USERNAME, channel: "ui" });
    expect(String(total)).toBe(await text(uma, "pairs"));
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.every(({ buckets }) => buckets.length === 90)).toBe(true);
    expect(await uma.evaluate<string>(`${shown("main h1")}.textContent`)).toBe("MRP — Prod");
  });

  it("starts no run of itself when demand and stock change and users browse (RUN-001, R10)", async () => {
    await open(uma);
    const before = { id: await text(uma, "id"), time: await text(uma, "time") };
    const material = await created("/api/tenants/prod/materials", { type: "finished", description: "mrpui drawer", baseUnit: "each" });
    const location = await created("/api/tenants/prod/locations", { name: "mrpui store" });
    const customer = await created("/api/tenants/prod/customers", { name: "mrpui retail" });
    await api("POST", "/api/tenants/prod/stock/corrections", { material, location, quantity: "2", unit: "each", reason: "mrpui recount" });
    await api("POST", "/api/tenants/prod/customer-orders", { customer, location, lines: [{ material, quantity: "9", unit: "each", requiredDate: day(5) }] });

    for (const path of ["/admin/prod/stock", "/admin/prod/customer-orders", "/admin/prod/reports/stock"]) {
      await uma.open(`${baseUrl}${path}`);
      await uma.waitUntil(`Boolean(${shown("main h1")})`);
    }
    await open(uma);

    expect({ id: await text(uma, "id"), time: await text(uma, "time") }).toEqual(before);
    expect((await latest()).run.id).toBe(before.id);
  });

  it("keeps the latest run readable in a read-only tenant and offers no Run, to a user or the admin (RUN-021, TEN-019)", async () => {
    await open(uma);
    const shownRun = await text(uma, "id");
    expect((await setReadOnly(true)).status).toBe(200);
    try {
      for (const browser of [uma, admin]) {
        await open(browser);
        await browser.waitUntil(`(${shown(field("id"))}?.textContent ?? "") === ${JSON.stringify(shownRun)}`);
        expect(await browser.evaluate<boolean>(`Boolean(${shown(RUN_BUTTON)})`)).toBe(false);
      }
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });

  it("has a help topic in the help page", async () => {
    await uma.open(`${baseUrl}/help?q=MRP`);
    await uma.waitFor("section#mrp");

    expect(await uma.text("section#mrp h2")).toBe("MRP");
    expect(await uma.text("section#mrp")).toContain("POST /api/tenants/{tenant}/mrp/runs");
  });
});
