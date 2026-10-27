import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { proxyResponseTimeoutSeconds } from "../deploy-config";
import { allPages, callApi, json, untilOk } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const password = inject("adminPassword");
const TOKEN = "reset-realistic-admin";

/** The first element matching `selector` outside Next.js's hidden staging container. */
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
/** The rows of the shown table named `name`, as their cells' text. */
const tableRows = (browser: Browser, name: string) =>
  browser.evaluate<string[][]>(`(() => {
    const table = [...document.querySelectorAll("main table")].find((t) => t.getAttribute("aria-label") === ${JSON.stringify(name)} && !t.closest("[hidden]"));
    return [...table.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")));
  })()`);
const newestFirst = (rows: { date: string }[]) => rows.every(({ date }, index) => index === 0 || rows[index - 1].date >= date);

// Test starts with the tiny dataset, and every other file runs on it. This file resets Test to the realistic
// two years once, through the API (spec 2026-10-22--0902UTC-test-tenant-two-datasets, Q4), checks what only
// that volume shows, and resets Test back to tiny for the files after it.
describe("the realistic Test dataset, written by an API reset", () => {
  let admin: Browser;
  let secret: string;
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}) => callApi(baseUrl, method, path, secret, options);
  const generation = async () => (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
  const reset = async (body: unknown) => api("POST", "/api/tenants/test/reset", { key: randomUUID(), body, generation: await generation() });
  const ledger = async () => (await tableRows(admin, "Stock movements")).map(([date, type, , source, reason]) => ({ date, type, source, reason }));

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, password);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, TOKEN);
    await admin.setViewport(1280, 800);
    const seconds = (since: number) => (performance.now() - since) / 1000;
    const started = performance.now();
    let writeSeconds = 0;
    let upSeconds = 0;
    // A Prod write issued 2 s into the reset waits for it: other requests queue behind the reset's
    // transaction on the server's one connection and complete once it commits (spec
    // 2026-10-21--0718UTC-test-tenant-dataset, Q16). Like kamal-proxy's, it goes on a pooled connection,
    // which the image's KEEP_ALIVE_TIMEOUT keeps open through the reset (#185; a local server started
    // without it answers ECONNRESET here).
    const prodWriteDuringReset = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const writeStarted = performance.now();
      const response = await api("POST", "/api/tenants/prod/locations", { key: randomUUID(), body: { name: "reset-realistic prod write" } });
      writeSeconds = seconds(writeStarted);
      return response;
    };
    // The health check doesn't wait: the seed gives the event loop a turn between documents and the ping
    // skips the connection mutex (#185), so kamal-proxy and uptime checks see a live app throughout.
    const upDuringReset = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const upStarted = performance.now();
      const response = await fetch(`${baseUrl}/up`);
      upSeconds = seconds(upStarted);
      return response;
    };
    const [realistic, prodWrite, up] = await Promise.all([reset({ dataset: "realistic" }), prodWriteDuringReset(), upDuringReset()]);
    const resetSeconds = seconds(started);
    // The runner's figures, which the spec leaves without a budget (Q7). Straight to stdout: Vitest drops
    // a passing test's console output.
    process.stdout.write(`The realistic Test reset took ${resetSeconds.toFixed(1)} s on this runner\n`);
    process.stdout.write(`A Prod write issued 2 s into it answered after ${writeSeconds.toFixed(1)} s\n`);
    process.stdout.write(`GET /up issued 2 s into it answered after ${upSeconds.toFixed(2)} s\n`);
    expect(realistic.status).toBe(200);
    expect(prodWrite.status).toBe(200);
    expect(up.status).toBe(200);
    expect(await up.text()).toBe("OK");
    // Answered while the reset was still running, within seconds, not once it had committed.
    expect(upSeconds).toBeLessThan(5);
    expect(2 + upSeconds).toBeLessThan(resetSeconds);
    // Behind kamal-proxy the reset or the write would answer 504 past its response timeout, though the reset commits (#185).
    expect(resetSeconds).toBeLessThan(proxyResponseTimeoutSeconds());
    expect(writeSeconds).toBeLessThan(proxyResponseTimeoutSeconds());
  }, 180_000);
  afterAll(async () => {
    try {
      // Retried once; a restore that still fails fails this file with the reason, since the files after it
      // on the shard would otherwise run on the realistic dataset and fail far from the cause (#192).
      if (secret) await untilOk("Restoring the tiny Test dataset failed, so the files after this one run on the realistic one", () => reset({}));
    } finally {
      // The token is revoked and the browser closed whether or not the restore worked.
      try {
        if (secret) {
          const tokens = json(await api("GET", "/api/tokens")).data as { id: string; name: string }[];
          const own = tokens.find(({ name }) => name === TOKEN);
          if (own) await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
        }
      } finally { await admin.close(); }
    }
  }, 120_000);

  it("runs MRP over the realistic dataset while /up keeps answering (E14-S02, lessons 2026-10-24)", async () => {
    // A warm pooled connection first, as kamal-proxy keeps one (lesson 2026-10-24, "A blocked event loop closes pooled connections unread").
    expect((await fetch(`${baseUrl}/up`)).status).toBe(200);
    const started = performance.now();
    let runMs = 0;
    let upMs = 0;
    const run = api("POST", "/api/tenants/test/mrp/runs", { key: randomUUID(), body: {}, generation: await generation() }).then((response) => {
      runMs = performance.now() - started;
      return response;
    });
    // Issued right behind the run: a run that yields while it reads and writes lets the health check answer
    // first; one that blocked the event loop would answer the run before it.
    const up = await fetch(`${baseUrl}/up`);
    upMs = performance.now() - started;
    const response = await run;

    process.stdout.write(`An MRP run over the realistic Test dataset answered after ${runMs.toFixed(0)} ms; GET /up issued right behind it after ${upMs.toFixed(0)} ms\n`);
    expect(response.status, response.text).toBe(200);
    expect(json(response).data).toMatchObject({ channel: "api", horizonDays: 90 });
    expect((json(response).data as { pairs: number }).pairs).toBeGreaterThanOrEqual(30);
    expect(up.status).toBe(200);
    expect(upMs).toBeLessThan(runMs);
  });

  it("writes two years of customer orders, many pages of them, and audits the reset as realistic (TEN-022, AUD-013)", async () => {
    const orders = await allPages(async (page) => json(await api("GET", `/api/tenants/test/customer-orders?page=${page}`)).data as { id: string; status: string }[]);
    expect(orders[0].id).toBe("00000001");
    expect(orders.length).toBeGreaterThan(300);
    expect(orders.some(({ status }) => status === "open")).toBe(true);
    const entries = json(await api("GET", "/api/audit?limit=100")).data.entries as { action: string; after: Record<string, unknown> | null }[];
    expect(entries.find(({ action }) => action === "tenants.tenant.reset")).toMatchObject({ after: { dataset: "realistic" } });
  });

  it("pages the purchase-order list by 100 (?page=, additive): Test spans several pages, an invalid page is refused", async () => {
    const page = async (number?: number) =>
      json(await api("GET", `/api/tenants/test/purchase-orders${number === undefined ? "" : `?page=${number}`}`)).data as { id: string }[];
    const first = await page();
    const second = await page(2);

    expect(first).toHaveLength(100);
    expect(await page(1)).toEqual(first);
    expect(second.length).toBeGreaterThan(0);
    expect(second.length).toBeLessThanOrEqual(100);
    expect(second.some(({ id }) => first.some((order) => order.id === id))).toBe(false);
    expect(Number(second[0].id)).toBeGreaterThan(Number(first[99].id));
    expect(await page(1000)).toEqual([]);
    for (const bad of ["0", "x"]) {
      const refused = await api("GET", `/api/tenants/test/purchase-orders?page=${bad}`);
      expect(refused.status).toBe(400);
      expect(json(refused).error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("pages the purchase-order screen: Page 1 of N with Next only, page 2 continuing the IDs", async () => {
    const rows = async (path: string) => {
      await admin.open(`${baseUrl}${path}`);
      await admin.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
      return admin.evaluate<string[][]>(`[...document.querySelectorAll("main table tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`);
    };
    const first = await rows("/admin/test/purchase-orders");
    expect(first).toHaveLength(100);
    expect(first[0][0]).toBe("00000001");
    const nav = `document.querySelector('main nav[aria-label="Purchase order pages"]')`;
    await admin.waitUntil(`${nav} && !${nav}.closest("[hidden]")`);
    const label = await admin.evaluate<string>(`${nav}.querySelector("span").textContent`);
    expect(Number(/^Page 1 of (\d+)$/.exec(label)![1])).toBeGreaterThan(1);
    expect(await admin.evaluate<string[]>(`[...${nav}.querySelectorAll("a")].map((a) => a.textContent.trim())`)).toEqual(["Next"]);
    const second = await rows("/admin/test/purchase-orders?page=2");
    expect(second[0][0]).toBe(String(Number(first[99][0]) + 1).padStart(8, "0"));
  });

  it("shows a Test pair's two-year history newest first, each receipt and completion linking its document (INV-012)", async () => {
    // Steel sheet 1.0 mm at the main plant: weekly receipts and the week's completions, for two years.
    await admin.open(`${baseUrl}/admin/test/stock?material=00000007&location=00000001`);
    await admin.waitUntil(shown("table[aria-label='Stock movements']"));
    const rows = await ledger();
    expect(newestFirst(rows)).toBe(true);
    const receipts = rows.filter(({ type }) => type === "Goods receipt");
    const completions = rows.filter(({ type }) => type === "Production completion");
    expect(receipts.length).toBeGreaterThan(10);
    expect(completions.length).toBeGreaterThan(30);
    for (const { source } of receipts) expect(source).toMatch(/^Purchase order \d{8} Goods receipt \S+$/);
    for (const { source } of completions) expect(source).toMatch(/^Production order \d{8} Production completion \S+$/);
  });

  it("pages a finished product's two-year ledger, back to the dataset's opening balance", async () => {
    // The red cabinet at the main plant: a completion every week and its customers' goods issues every day, well over a page.
    const pair = "material=00000005&location=00000001";
    const { movementCount } = json(await api("GET", `/api/tenants/test/stock?${pair}`)).data as { movementCount: number };
    const pages = Math.ceil(movementCount / 100);
    expect(pages).toBeGreaterThan(1);

    await admin.open(`${baseUrl}/admin/test/stock?${pair}`);
    await admin.waitUntil(shown("table[aria-label='Stock movements']"));
    await admin.waitForText(`Page 1 of ${pages}`);
    const first = await ledger();
    expect(first).toHaveLength(100);
    expect(first.some(({ type }) => type === "Goods issue")).toBe(true);
    expect(first.some(({ type }) => type === "Production completion")).toBe(true);

    await clickHydrated(admin, "main a[href$='page=2']");
    await admin.waitUntil(`location.search.includes("page=2")`);
    await admin.waitForText(`Page 2 of ${pages}`);
    expect(newestFirst([...first, ...(await ledger())])).toBe(true);

    // The oldest movement is the dataset's opening balance, a correction that is its own source.
    await admin.open(`${baseUrl}/admin/test/stock?${pair}&page=${pages}`);
    await admin.waitForText(`Page ${pages} of ${pages}`);
    expect((await ledger()).at(-1)).toMatchObject({ type: "Correction", source: "This correction", reason: expect.stringContaining("Demonstration opening balance") });
  });
});
