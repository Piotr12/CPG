import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { AuditPage, OrderView, ReceiptView, StockView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, hydrated, signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
// This file's own account and records: other files share the app, and users are never deleted.
const username = `history-${randomUUID().slice(0, 8)}`;
const password = "audit-history-integration-password";
/** A UTC day, read when asserted: a run that crosses midnight still compares like with like. */
const utcDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** One audit row's cells: time, account, session, channel, action, subject, changes. */
type Row = [string, string, string, string, string, string, string];

/** Whether an element matching `selector` is shown, not still in a streamed `[hidden]` container. */
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].some((e) => !e.closest("[hidden]"))`;

/** Opens an audit screen and waits until its filter form and table are really shown and hydrated. */
async function openAudit(browser: Browser, path: string) {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(`${shown("main form[aria-label]")} && ${shown("main table")}`);
}

/** The shown table's entry rows (an empty state is one cell, not a row of seven). */
const rows = (browser: Browser) =>
  browser.evaluate<Row[]>(
    `[...document.querySelectorAll("main tbody tr")].filter((row) => !row.closest("[hidden]") && row.cells.length === 7).map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );

/** Follows the first shown link matching `selector` as a reader would, once React can route it. */
async function follow(browser: Browser, selector: string, urlPart: string) {
  const link = `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
  await browser.waitUntil(hydrated(link));
  await browser.evaluate(`${link}.click()`);
  await browser.waitUntil(`location.href.includes(${JSON.stringify(urlPart)})`);
  // The new page has rendered once its form shows the URL's record.
  await browser.waitUntil(
    `${shown("main table")} && [...document.querySelectorAll("#audit-subject-id")].some((input) => !input.closest("[hidden]") && input.value === (new URLSearchParams(location.search).get("subjectId") ?? ""))`,
  );
}

describe("tracing one record's history in the audit (E13-S03, #96)", () => {
  let admin: Browser;
  let operator: Browser;
  let adminSecret: string;
  let operatorSecret: string;
  let material: string;
  let location: string;
  let purchase: OrderView;
  let receipt: ReceiptView;
  let correction: string;
  let inverse: string;

  async function api<T>(method: string, endpoint: string, body?: unknown, secret = adminSecret) {
    const response = await callApi(baseUrl, method, endpoint, secret, { body, key: method === "GET" ? undefined : randomUUID() });
    return { status: response.status, text: response.text, body: json(response) as { ok: boolean; data: T; error: { code: string; fieldErrors?: Record<string, string[]> } } };
  }
  const create = async <T>(path: string, body: unknown, secret = adminSecret) => {
    const response = await api<T>("POST", `/api/tenants/prod/${path}`, body, secret);
    expect(response.status).toBe(200);
    return response.body.data;
  };

  beforeAll(async () => {
    admin = openBrowser();
    operator = openBrowser();
    await signInAsAdmin(admin, baseUrl, inject("adminPassword"));
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, `${username}-admin`);
    expect((await api("POST", "/api/users", { username, password })).status).toBe(200);
    await signInAs(operator, baseUrl, username, password);
    await openTokens(operator, baseUrl);
    operatorSecret = await createToken(operator, `${username}-operator`);
    material = (await create<{ id: string }>("materials", { type: "raw", description: `${username} bolts`, baseUnit: "each" })).id;
    location = (await create<{ id: string }>("locations", { name: `${username} warehouse` })).id;
    const supplier = (await create<{ id: string }>("suppliers", { name: `${username} supplier` })).id;
    purchase = await create<OrderView>("purchase-orders", { supplier, location, lines: [{ material, quantity: "10", unit: "each", plannedDate: "2027-01-05" }] }, operatorSecret);
    receipt = await create<ReceiptView>("goods-receipts", { purchaseOrder: purchase.id, lines: [{ line: 1, quantity: "4", unit: "each" }] }, operatorSecret);
  });
  afterAll(async () => {
    if (operator && operatorSecret) await choosePreference(operator, "en").catch(() => undefined);
    for (const secret of [adminSecret, operatorSecret].filter(Boolean)) {
      const tokens = await api<{ id: string; name: string }[]>("GET", "/api/tokens", undefined, secret);
      for (const token of tokens.body.data.filter(({ name }) => name.startsWith(username))) await api("DELETE", `/api/tokens/${token.id}`, undefined, secret);
    }
    await Promise.all([admin?.close(), operator?.close()]);
  });

  it("opens a purchase order's history from its Subject link: only its entries, newest first (PRD §07)", async () => {
    await openAudit(operator, `/admin/prod/audit?account=${username}&subjectType=PurchaseOrder`);
    const own = await rows(operator);
    expect(own.map(([, account, , , action]) => [account, action])).toEqual([
      [username, "Purchase order received"],
      [username, "Purchase order created"],
    ]);
    for (const [, , , channel] of own) expect(channel).toMatch(new RegExp(`^API\\s*${username}-operator$`));

    await openAudit(operator, `/admin/prod/audit?account=${username}`);
    await follow(operator, `main a[href*="subjectType=PurchaseOrder"]`, `subjectId=${purchase.id}`);

    const history = await rows(operator);
    expect(history.map(([, , , , action]) => action)).toEqual(["Purchase order received", "Purchase order created"]);
    expect(new Set(history.map(([, , , , , subject]) => subject)).size).toBe(1);
    expect(history[0][5]).toContain(purchase.id);
    expect((await operator.evaluate<string>(`document.querySelector("#audit-subject-id").value`))).toBe(purchase.id);
    expect(await operator.text("main")).toContain("Showing entries that match the filters.");
  });

  it("shows a receipt's business date beside the audit time, while the order keeps its planned date (AUD-030)", async () => {
    const movement = receipt.lines[0].movementId!;
    await openAudit(operator, `/admin/prod/audit?subjectType=StockMovement&subjectId=${movement}`);

    const [posted] = await rows(operator);
    expect(posted[0]).toMatch(new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\nBusiness date ${utcDay()}$`));
    expect(posted[4]).toBe("Stock movement posted");
    expect((await api<OrderView>("GET", `/api/tenants/prod/purchase-orders/${purchase.id}`)).body.data.lines[0]).toMatchObject({ plannedDate: "2027-01-05" });
  });

  it("links a UI correction and its reversal both ways, with UI channel, session, account and reason (AUD-004, AUD-006, REV-020)", async () => {
    // A transactional change through the UI: a stock correction, then its full reversal.
    await operator.open(`${baseUrl}/admin/prod/stock?material=${material}&location=${location}`);
    await operator.waitFor("[data-stock-balance]");
    await operator.waitUntil(hydrated(`document.querySelector("main button:not([type=submit])")`));
    await operator.clickRole("button", "Post correction");
    await operator.waitFor("[role=dialog]");
    await operator.fillLabel("Signed quantity", "3");
    await operator.fillLabel("Reason", "History count");
    await operator.click("[role=dialog] button[type=submit]");
    await operator.waitUntil(`!document.querySelector("[role=dialog]")`);
    const ledger = await api<StockView>("GET", `/api/tenants/prod/stock?material=${material}&location=${location}`);
    correction = ledger.body.data.movements[0].id;

    await operator.open(`${baseUrl}/admin/prod/stock?material=${material}&location=${location}&movement=${correction}`);
    await operator.waitForText("Selected movement");
    await operator.waitUntil(hydrated(`document.querySelector('section[aria-label="Selected movement"] button')`));
    await operator.click('section[aria-label="Selected movement"] button');
    await operator.waitFor("[role=dialog]");
    await operator.fillLabel("Reason", "History wrong bin");
    await operator.clickRole("button", "Reverse full quantity");
    await operator.waitUntil(`!document.querySelector("[role=dialog]")`);

    await openAudit(operator, `/admin/prod/audit?subjectType=StockMovement&subjectId=${correction}`);
    const original = await rows(operator);
    expect(original.map(([, account, session, channel, action]) => [account, /^[0-9a-f]{8}$/.test(session), channel, action])).toEqual([
      [username, true, "UI", "Stock movement reversed"],
      [username, true, "UI", "Stock movement posted"],
    ]);
    expect(original[0][0]).toContain(`Business date ${utcDay()}`);
    expect(original[0][6]).toContain("reason: — → History wrong bin");
    expect(original[0][6]).toMatch(/Reversed by [0-9a-f]{8}$/);
    expect(original[1][6]).toMatch(/Reversed by [0-9a-f]{8}$/);

    await follow(operator, `main a[title][href*="subjectType=StockMovement"]`, "subjectId=");
    inverse = new URL(await operator.url()).searchParams.get("subjectId")!;
    expect(inverse).not.toBe(correction);
    const reversal = await rows(operator);
    expect(reversal.map(([, account, , channel, action]) => [account, channel, action])).toEqual([[username, "UI", "Stock movement posted"]]);
    expect(reversal[0][6]).toContain("reason: — → History wrong bin");
    expect(reversal[0][6]).toContain("type: — → reversal");
    expect(reversal[0][6]).toMatch(new RegExp(`Reverses ${correction.slice(0, 8)}$`));
  });

  it("filters by account, channel and day on the tenant and the Global audit, and keeps the filters when paging", async () => {
    await openAudit(operator, `/admin/prod/audit?account=${username}&channel=ui&from=${utcDay()}&to=${utcDay()}`);
    const ui = await rows(operator);
    expect(ui.length).toBeGreaterThanOrEqual(3);
    expect(ui.every(([, account, , channel]) => account === username && channel === "UI")).toBe(true);

    await openAudit(operator, `/admin/prod/audit?account=${username}&from=${utcDay(1)}`);
    expect(await rows(operator)).toEqual([]);
    expect(await operator.text("main")).toContain("No entries match these filters.");

    // An ID typed without its record type is explained in the form, not answered with a not-found page.
    await openAudit(operator, "/admin/prod/audit");
    await operator.fill("#audit-subject-id", purchase.id);
    await operator.waitUntil(hydrated(`document.querySelector("main form button[type=submit]")`));
    await operator.click("main form button[type=submit]");
    await operator.waitUntil(`location.search.includes("subjectId=") && ${shown("#audit-filter-errors")}`);
    expect(await operator.text("#audit-filter-errors")).toContain("Choose the record type for this ID");
    expect(await operator.evaluate<boolean>(shown("main table"))).toBe(false);
    expect(await operator.evaluate<string>(`document.querySelector("#audit-subject-id").value`)).toBe(purchase.id);

    // A Global entry of the operator's through the API: a spare token, revoked with the bearer token.
    await openTokens(operator, baseUrl);
    await createToken(operator, `${username}-spare`);
    const tokens = await api<{ id: string; name: string }[]>("GET", "/api/tokens", undefined, operatorSecret);
    const spare = tokens.body.data.find(({ name }) => name === `${username}-spare`)!;
    expect((await api("DELETE", `/api/tokens/${spare.id}`, undefined, operatorSecret)).status).toBe(200);

    // The form: choose the account and the API channel on the Global audit, then Apply.
    await openAudit(operator, "/admin/audit");
    await operator.select("#audit-account", username);
    await operator.select("#audit-channel", "api");
    await operator.waitUntil(hydrated(`document.querySelector("main form button[type=submit]")`));
    await operator.click("main form button[type=submit]");
    await operator.waitUntil(`location.search.includes("account=${username}") && location.search.includes("channel=api")`);
    await operator.waitUntil(shown("main table"));
    const global = await rows(operator);
    expect(global.map(([, , , , action]) => action)).toContain("API token revoked");
    expect(global.every(([, account, , channel]) => account === username && channel.startsWith("API"))).toBe(true);

    await openAudit(operator, `/admin/prod/audit?account=${username}&limit=1`);
    const older = await operator.evaluate<string>(`[...document.querySelectorAll("main nav a")].find((a) => !a.closest("[hidden]"))?.getAttribute("href") ?? ""`);
    expect(older).toMatch(new RegExp(`^/admin/prod/audit\\?account=${username}&before=[0-9a-f-]{36}$`));
  });

  it("gives a normal user's bearer token the same filtered entries as the screen, with no secret in them (R07, API-014, AUD-028, AUD-029)", async () => {
    const query = `account=${username}&subjectType=StockMovement&channel=ui`;
    await openAudit(operator, `/admin/prod/audit?${query}`);
    const screen = await rows(operator);
    const tenant = await api<AuditPage>("GET", `/api/tenants/prod/audit?${query}`, undefined, operatorSecret);
    expect(tenant.status).toBe(200);
    expect(tenant.body.data.entries.map(({ action }) => action)).toEqual(screen.map(([, , , , action]) => (action === "Stock movement reversed" ? "stock.movement.reversed" : "stock.movement.posted")));
    expect(tenant.body.data.entries).toHaveLength(screen.length);
    expect(Object.keys(tenant.body.data.entries[0]).sort()).toEqual(["action", "actor", "after", "before", "channel", "id", "occurredAt", "sessionId", "subject", "token"]);
    expect(tenant.text).not.toContain(operatorSecret);
    expect(tenant.text).not.toContain(adminSecret);

    const global = await api<AuditPage>("GET", `/api/audit?account=${username}&subjectType=ApiToken`, undefined, operatorSecret);
    expect(global.body.data.entries.map(({ action }) => action)).toContain("tokens.api-token.created");
    expect(global.text).not.toContain(operatorSecret);

    const refused = await api("GET", "/api/tenants/prod/audit?subjectId=00000001", undefined, operatorSecret);
    expect(refused.status).toBe(400);
    expect(Object.keys(refused.body.error.fieldErrors ?? {})).toEqual(["subjectId"]);
  });

  it("reads in Polish with the recorded facts unchanged (UX-022)", async () => {
    await choosePreference(operator, "pl");
    await operator.waitUntil(`document.documentElement.lang === "pl"`);
    await openAudit(operator, `/admin/prod/audit?subjectType=StockMovement&subjectId=${correction}`);

    expect(await operator.text("main h1")).toBe("Audyt — Prod");
    const [reversed] = await rows(operator);
    expect(reversed[4]).toBe("Odwrócono ruch zapasu");
    expect(reversed[0]).toContain(`Data księgowania ${utcDay()}`);
    expect(reversed[6]).toContain("odwrócony: nie → tak");
    expect(reversed[6]).toContain("powód: — → History wrong bin");
    expect(reversed[6]).toMatch(/Odwrócony przez [0-9a-f]{8}$/);
    await choosePreference(operator, "en");
    await operator.waitUntil(`document.documentElement.lang === "en"`);
  });

  it("keeps every column in view at 1280 × 800 and the form usable at 390 px", async () => {
    await operator.setViewport(1280, 800);
    await openAudit(operator, `/admin/prod/audit?subjectType=StockMovement&subjectId=${correction}`);
    expect(await operator.evaluate<boolean>(`(() => {
      const changes = [...document.querySelectorAll("main thead th")].find((th) => !th.closest("[hidden]") && th.innerText.trim() === "Changes");
      return Boolean(changes) && changes.getBoundingClientRect().right <= innerWidth;
    })()`)).toBe(true);

    await operator.setViewport(390, 844);
    await openAudit(operator, `/admin/prod/audit?subjectType=StockMovement&subjectId=${correction}`);
    expect(await operator.evaluate<boolean>(`document.documentElement.scrollWidth <= innerWidth`)).toBe(true);
    expect(await operator.evaluate<boolean>(`[...document.querySelectorAll("main form input, main form select, main form button")].every((e) => e.getBoundingClientRect().right <= innerWidth)`)).toBe(true);
    expect(await operator.evaluate<number>(`[...document.querySelectorAll('main a[href*="subjectType=StockMovement"]')].filter((a) => !a.closest("[hidden]")).length`)).toBeGreaterThan(0);
    await operator.setViewport(1280, 800);
  });
});
