import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MrpLatestView, MrpShortageView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own accounts, token and records: users are never deleted, and other files share the app.
const USERNAME = "mrpshort-sam";
const PASSWORD = "mrpshort sam's first password";
const SETUP_TOKEN = "mrpshort-setup";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
const DAYS = "table[aria-label='Days of the plan']";
/** A day `days` after the server's UTC today, as the run plans from it. */
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

// #380 (E18-S04): the stored run, the API and the report show which order, forecast or safety target went short, in
// priority order (DEM-018 to DEM-022, MRP-044). One Prod pair with no planning parameters, so nothing is proposed and
// the ranking shows as is: 12 kg on hand and a safety stock of 5 kg from today; O1 needs 10 on day 4; O2 needs 10
// and O3 4 on day 5, beside a forecast on day 5.
describe("the MRP report's short requirements", () => {
  let admin: Browser;
  let sam: Browser;
  let adminSecret: string;
  let samSecret: string;
  const ids = {} as Record<"material" | "location" | "o1" | "o2" | "o3", string>;
  /** The forecast's residual on day 5 (D08): 25 less the orders of its own calendar month. */
  let residual: number;

  const api = (method: string, path: string, secret = adminSecret, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => {
    const response = await api("POST", path, adminSecret, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data.id as string;
  };
  const report = async (secret: string) => {
    const response = await api("GET", `/api/tenants/prod/mrp/runs/latest?material=${ids.material}&location=${ids.location}`, secret);
    expect(response.status, response.text).toBe(200);
    return json(response).data as MrpLatestView;
  };
  const setReadOnly = (readOnly: boolean) => api("PATCH", "/api/tenants/prod", adminSecret, { readOnly });
  const at = (shortages: MrpShortageView[], date: string) => shortages.filter((shortage) => shortage.date === date);
  const quantity = (units: number) => `${units}.000000`;

  beforeAll(async () => {
    [admin, sam] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, SETUP_TOKEN);
    ids.material = await create("/api/tenants/prod/materials", { type: "finished", description: "mrpshort cabinet", baseUnit: "kg" });
    ids.location = await create("/api/tenants/prod/locations", { name: "mrpshort plant" });
    const customer = await create("/api/tenants/prod/customers", { name: "mrpshort retail" });
    const pair = { material: ids.material, location: ids.location };
    await create("/api/tenants/prod/stock/corrections", { ...pair, quantity: "12", unit: "kg", reason: "mrpshort count" });
    await create("/api/tenants/prod/safety-stock-targets", { ...pair, effectiveFrom: day(0), quantity: "5" });
    await create("/api/tenants/prod/forecasts", { ...pair, date: day(5), quantity: "25", unit: "kg" });
    const line = (quantity: string, requiredDate: string) => ({ customer, location: ids.location, lines: [{ material: ids.material, quantity, unit: "kg", requiredDate }] });
    ids.o1 = await create("/api/tenants/prod/customer-orders", line("10", day(4)));
    ids.o2 = await create("/api/tenants/prod/customer-orders", line("10", day(5)));
    ids.o3 = await create("/api/tenants/prod/customer-orders", line("4", day(5)));
    const sameMonth = day(4).slice(0, 7) === day(5).slice(0, 7);
    residual = 25 - 14 - (sameMonth ? 10 : 0);
    const ran = await api("POST", "/api/tenants/prod/mrp/runs", adminSecret, {});
    expect(ran.status, ran.text).toBe(200);
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(sam, baseUrl, PASSWORD, USERNAME);
    await sam.waitUntil(signedInAndHydrated(USERNAME));
    await openTokens(sam, baseUrl);
    samSecret = await createToken(sam, "mrpshort-sam-cli");
    await sam.setViewport(1280, 800);
  });
  afterAll(async () => {
    try {
      // Later files write to Prod, and expect the admin to hold no tokens: revoke this file's with itself.
      expect((await setReadOnly(false)).status).toBe(200);
      const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, adminSecret, { key: randomUUID() });
    } finally {
      await Promise.all([admin, sam].map((browser) => browser.close()));
    }
  });

  it("returns each day's short requirements in priority order, the same for a normal user and the admin (DEM-018…DEM-022, MRP-044, R07)", async () => {
    const [mine, theirs] = [await report(samSecret), await report(adminSecret)];
    expect(mine).toEqual(theirs);
    const [{ shortages }] = mine.plans;

    // Days 0 to 3: 12 on hand covers the safety stock of 5, so nothing is short.
    expect(shortages.filter(({ date }) => date < day(4))).toEqual([]);
    // DEM-018: O1 is served in full, and the safety stock's gap is listed as the lower-priority requirement.
    expect(at(shortages, day(4))).toEqual([
      { kind: "safety-target", date: day(4), originalDate: day(4), document: null, position: null, required: quantity(5), uncovered: quantity(3), root: null },
    ]);
    // DEM-020, DEM-021: O1's earlier date was served first, and O2 and O3, due the same day, are equal and ordered by ID only.
    // DEM-019, MRP-044: the firm orders come before the forecast, whose residual is short. DEM-022: the forecast before the target.
    expect(at(shortages, day(5))).toEqual([
      { kind: "customer-order", date: day(5), originalDate: day(5), document: ids.o2, position: 0, required: quantity(10), uncovered: quantity(8), root: null },
      { kind: "customer-order", date: day(5), originalDate: day(5), document: ids.o3, position: 0, required: quantity(4), uncovered: quantity(4), root: null },
      { kind: "forecast", date: day(5), originalDate: day(5), document: null, position: null, required: quantity(residual), uncovered: quantity(residual), root: null },
      { kind: "safety-target", date: day(5), originalDate: day(5), document: null, position: null, required: quantity(5), uncovered: quantity(5), root: null },
    ]);
    expect(shortages.some(({ document }) => document === ids.o1)).toBe(false);
    // The target stays short every later day; each order and the forecast is listed once, on its own day.
    expect(shortages.filter(({ date }) => date > day(5)).map(({ kind, uncovered }) => [kind, uncovered])).toEqual(Array.from({ length: 84 }, () => ["safety-target", quantity(5)]));
  });

  it("lists the same entries in the same order on the Day view, last on each row, and still while the tenant is read-only (TEN-018)", async () => {
    const listed = async (date: string) => {
      await sam.open(`${baseUrl}/admin/prod/mrp?material=${ids.material}&location=${ids.location}`);
      await sam.waitUntil(`Boolean(${shown(DAYS)}?.querySelector("[data-mrp-shortages]"))`);
      return sam.evaluate<{ kinds: (string | undefined)[]; texts: string[]; last: boolean; header: string }>(`(() => {
        const table = ${shown(DAYS)};
        const row = [...table.querySelectorAll("tbody tr")].find((tr) => tr.querySelector("[data-mrp-date]")?.textContent === ${JSON.stringify(date)});
        const items = [...row.querySelectorAll("[data-mrp-shortage]")];
        return {
          kinds: items.map((item) => item.getAttribute("data-mrp-shortage")),
          texts: items.map((item) => item.textContent),
          last: Boolean(row.lastElementChild.querySelector("[data-mrp-shortages]")),
          header: [...table.querySelectorAll("thead th")].at(-1).textContent,
        };
      })()`);
    };
    const expectDayFive = (seen: Awaited<ReturnType<typeof listed>>) => {
      expect(seen.kinds).toEqual(["customer-order", "customer-order", "forecast", "safety-target"]);
      expect(seen.texts[0]).toMatch(new RegExp(`^Customer order ${ids.o2}/0 · due .+ · 8 kg short of 10 kg$`));
      expect(seen.texts[1]).toMatch(new RegExp(`^Customer order ${ids.o3}/0 · due .+ · 4 kg short of 4 kg$`));
      expect(seen.texts[2]).toMatch(new RegExp(`^Forecast · .+ · ${residual} kg short of ${residual} kg$`));
      expect(seen.texts[3]).toBe("Safety stock · 5 kg short of 5 kg");
      expect(seen.last).toBe(true);
      expect(seen.header).toBe("Short requirements");
    };

    expectDayFive(await listed(day(5)));
    expect((await listed(day(4))).texts).toEqual(["Safety stock · 3 kg short of 5 kg"]);

    expect((await setReadOnly(true)).status).toBe(200);
    try {
      expectDayFive(await listed(day(5)));
      expect(at((await report(samSecret)).plans[0].shortages, day(5))).toHaveLength(4);
    } finally {
      expect((await setReadOnly(false)).status).toBe(200);
    }
  });
});
