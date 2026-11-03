import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect } from "vitest";
import type { MrpLatestView, MrpPlanView } from "@cpg/core";
import { allPages, callApi, json, type ApiResponse } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

/*
 * Shared steps of the cross-domain journeys (spec 2026-11-03--0626UTC-mrp-end-to-end-journeys): an API client that
 * proves no request or answer needs a finance field (UX-023, N01), MRP run and acceptance on the screen, and the
 * reads every journey repeats. Not a test file: the `e2e-*.test.ts` files use it.
 */

export type Tenant = "prod" | "test";

/** A day `days` after the server's UTC today, as MRP plans from it. */
export const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** The first day of next month (UTC), as an ISO date. */
export function firstOfNextMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

/**
 * Runs `scenario` once more when the UTC day changed while it ran, whether it passed or failed: a run from an
 * earlier day can't be accepted (#287 Q7), and every `day(n)` moves. The scenario must create its own records, so
 * the second attempt starts from nothing the first one left.
 */
export async function withinOneDay<T>(scenario: () => Promise<T>, attempt = 1): Promise<T> {
  const started = day(0);
  try {
    const result = await scenario();
    if (day(0) === started) return result;
  } catch (error) {
    if (day(0) === started) throw error;
  }
  expect(attempt, "a journey crosses midnight UTC at most once").toBe(1);
  return withinOneDay(scenario, attempt + 1);
}

/**
 * The words a finance field or screen entry would use (N01: no finance, costing, pricing, invoices, taxes or
 * refunds). Matched against whole words only: a key is split at its camelCase, kebab and snake boundaries, so
 * `deactivated` is not "vat" and `account`, the run's user, is not "accounting".
 */
const FINANCE_WORDS = new Set([
  "price", "prices", "pricing", "cost", "costs", "costing", "currency", "currencies", "invoice", "invoices", "invoicing",
  "accounting", "vat", "tax", "taxes", "payment", "payments", "refund", "refunds",
]);

/** Whether `text` holds a finance word, as a whole word in any case. */
export const hasFinanceWord = (text: string) => text.split(/[^A-Za-z]+/).some((word) => FINANCE_WORDS.has(word.toLowerCase()));

/** The finance words among a key's camelCase, kebab or snake parts. */
const keyHasFinanceWord = (key: string) => hasFinanceWord(key.replace(/([a-z])([A-Z])/g, "$1 $2"));

/** Every path in `value` whose key is a finance word, at any depth: `[]` when there is none. */
export function financeKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => financeKeys(item, `${path}[${index}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => [...(keyHasFinanceWord(key) ? [`${path}.${key}`] : []), ...financeKeys(item, `${path}.${key}`)]);
}

/**
 * A bearer-token client for one tenant, as an external tool calls the API (R07). Every write gets a fresh
 * `Idempotency-Key`, and Test writes the tenant's current generation. Every request body it sends and every answer
 * it reads is checked for finance keys (UX-023), and `checked` counts them.
 */
export function journeyApi(baseUrl: string, token: string | (() => string), tenant: Tenant) {
  const state = { checked: 0 };
  /** The secret, read at each call: a file's accounts create theirs in `beforeAll`. */
  const secret = () => (typeof token === "string" ? token : token());
  const root = `/api/tenants/${tenant}`;
  const noFinance = (value: unknown, what: string) => {
    expect(financeKeys(value), `finance fields in ${what}`).toEqual([]);
    state.checked += 1;
  };
  const generation = async () => (json(await callApi(baseUrl, "GET", "/api/tenants/test", secret())).data as { generation: number }).generation;
  /** Calls `path` under the tenant (or, starting with `/api/`, as given) and checks both directions. */
  async function call(method: string, path: string, body?: unknown, key = randomUUID()): Promise<ApiResponse> {
    const url = path.startsWith("/api/") ? path : `${root}${path}`;
    if (body !== undefined) noFinance(body, `${method} ${url} body`);
    const writes = method !== "GET";
    const response = await callApi(baseUrl, method, url, secret(), {
      ...(writes ? { key, body: body ?? {} } : {}),
      ...(writes && tenant === "test" && url.startsWith(root) ? { generation: await generation() } : {}),
    });
    if (response.text) noFinance(JSON.parse(response.text), `${method} ${url} answer`);
    return response;
  }
  /** The `data` of a call that must answer 200. */
  async function ok<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await call(method, path, body);
    expect(response.status, `${method} ${path}: ${response.text}`).toBe(200);
    return json(response).data as T;
  }
  return {
    state,
    call,
    generation,
    get: <T = any>(path: string) => ok<T>("GET", path), // eslint-disable-line @typescript-eslint/no-explicit-any
    post: <T = any>(path: string, body: unknown = {}) => ok<T>("POST", path, body), // eslint-disable-line @typescript-eslint/no-explicit-any
    patch: <T = any>(path: string, body: unknown) => ok<T>("PATCH", path, body), // eslint-disable-line @typescript-eslint/no-explicit-any
    /** Every row of a paged tenant list, read across every page (lesson 2026-11-02). */
    all: <T = any>(kind: string) => allPages(async (page) => ok<T[]>("GET", `/${kind}?page=${page}`)), // eslint-disable-line @typescript-eslint/no-explicit-any
    /** The latest run's plan for one pair, with the run. */
    plan: async (material: string, location: string): Promise<MrpPlanView & { run: MrpLatestView["run"] }> => {
      const { run, plans } = await ok<MrpLatestView>("GET", `/mrp/runs/latest?material=${material}&location=${location}`);
      expect(plans, `a plan for ${material} at ${location}`).toHaveLength(1);
      return { ...plans[0], run };
    },
    /** Runs MRP through the API (manual unless `mode` says otherwise) and returns its answer. */
    run: (mode: "manual" | "automatic" = "manual") => ok<{ id: string; mode: string; creation: unknown; documents?: { proposal: string; kind: string; id: string }[] }>("POST", "/mrp/runs", { mode }),
    /** Accepts one proposal of a run through the API and returns the document it created. */
    accept: async <T = any>(run: string, proposal: string) => (await ok<{ document: T }>("POST", `/mrp/runs/${run}/proposals/${proposal}/accept`, {})).document, // eslint-disable-line @typescript-eslint/no-explicit-any
    /** A pair's physical balance and its newest page of movements. */
    stock: (material: string, location: string) =>
      ok<{ quantity: string; movementCount: number; movements: StockMovement[] }>("GET", `/stock?material=${material}&location=${location}`),
    /** The tenant audit's entries about one subject, newest first. */
    audit: async (subjectType: string, subjectId: string) =>
      (await ok<{ entries: AuditEntry[] }>("GET", `/audit?limit=100&subjectType=${subjectType}&subjectId=${subjectId}`)).entries,
  };
}
export type JourneyApi = ReturnType<typeof journeyApi>;

export interface StockMovement {
  id: string;
  postingId: string;
  type: string;
  quantity: string;
  balanceAfter: string;
  reason: string | null;
  actorUsername: string;
  channel: string;
  reverses: string | null;
  reversedBy: string | null;
  source: { id: string; document: { type: string; id: string } | null } | null;
}
export interface AuditEntry {
  action: string;
  subject: { type: string; id: string };
  actor: { username: string };
  channel: string;
}

/** The first element matching `selector` outside Next.js's hidden staging container and earlier, hidden pages. */
export const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]") && e.offsetParent !== null)`;
const hydrated = (selector: string) => `Boolean(${shown(selector)}) && Object.keys(${shown(selector)}).some((key) => key.startsWith("__reactFiber"))`;
const RUN_BUTTON = "main button[data-mrp-run]";
const RUN_DIALOG = "[data-mrp-run-dialog]";
const RUN_SUBMIT = `${RUN_DIALOG} button[data-mrp-run-submit]`;
const RUN_ID = "main [data-mrp-field=id]";
const ACCEPT_DIALOG = "[role=alertdialog][data-state=open]";

/**
 * Asserts that the visible text of `selector` names no finance word (UX-023). A dialog is `position: fixed`, so it
 * has no `offsetParent`: it is read as the open one, never through `shown`.
 */
async function expectNoFinanceText(browser: Browser, selector: string, what: string, dialog = false) {
  const element = dialog ? `document.querySelector(${JSON.stringify(selector)})` : shown(selector);
  const text = await browser.evaluate<string>(`${element}?.innerText ?? ""`);
  expect(text.length, `${what} has text`).toBeGreaterThan(0);
  expect(hasFinanceWord(text), `a finance word on ${what}: ${text}`).toBe(false);
}

/** Opens a tenant's MRP page filtered to one pair, as a planner does. */
export async function openMrp(browser: Browser, baseUrl: string, tenant: Tenant, pair?: { material: string; location: string }) {
  await browser.open(`${baseUrl}/admin/${tenant}/mrp${pair ? `?material=${pair.material}&location=${pair.location}` : ""}`);
  await browser.waitUntil(hydrated(RUN_BUTTON));
}

/**
 * Runs MRP on the screen: opens the tenant's MRP page for `pair`, clicks Run MRP, chooses `mode` in the dialog and
 * confirms, then waits for the new run's ID with the dialog gone. Checks the dialog and the page for finance words
 * (UX-023), and returns the new run's ID.
 */
export async function runOnScreen(browser: Browser, baseUrl: string, tenant: Tenant, pair: { material: string; location: string }, mode: "manual" | "automatic" = "manual") {
  await openMrp(browser, baseUrl, tenant, pair);
  const before = await browser.evaluate<string>(`${shown(RUN_ID)}?.textContent ?? ""`);
  await browser.click(RUN_BUTTON);
  await browser.waitUntil(hydrated(RUN_SUBMIT));
  await expectNoFinanceText(browser, RUN_DIALOG, "the Run MRP dialog", true);
  if (mode === "automatic") {
    await browser.click(`${RUN_DIALOG} label:has(input[value=automatic])`);
    await browser.waitUntil(`document.querySelector("${RUN_DIALOG} input[value=automatic]").checked`);
  }
  await browser.click(RUN_SUBMIT);
  await browser.waitUntil(`(${shown(RUN_ID)}?.textContent ?? "") !== ${JSON.stringify(before)} && !document.querySelector("${RUN_DIALOG}")`);
  await expectNoFinanceText(browser, "main", "the MRP page");
  return browser.evaluate<string>(`${shown(RUN_ID)}.textContent`);
}

/**
 * Accepts the first shown proposal on the open MRP page: Accept, then `confirm` in the confirmation, then waits
 * for the document link. Checks the confirmation for finance words (UX-023) and returns the new document's ID.
 */
export async function acceptOnScreen(browser: Browser, confirm: "Create requisition" | "Create production order") {
  await browser.waitUntil(hydrated("main [data-mrp-accept]"));
  await browser.click("main [data-mrp-accept]");
  await browser.waitUntil(`Boolean(document.querySelector(${JSON.stringify(ACCEPT_DIALOG)}))`);
  await expectNoFinanceText(browser, ACCEPT_DIALOG, "the accept confirmation", true);
  await browser.clickRole("button", confirm);
  await browser.waitUntil(`Boolean(${shown("main [data-mrp-document]")}) && !document.querySelector(${JSON.stringify(ACCEPT_DIALOG)})`);
  const link = await browser.evaluate<string>(`${shown("main [data-mrp-document]")}.textContent`);
  return /(\d{8})$/.exec(link)![1];
}

/** The ledger's movements of one posting, by its `postingId`, among a pair's newest page. */
export const ofPosting = (movements: StockMovement[], postingId: string) => movements.filter((movement) => movement.postingId === postingId);

/**
 * One journey file's accounts, registered as its `beforeAll`/`afterAll`: the admin's token for the masters only the
 * admin may write, and a normal user of the file's own (`<prefix>-ola`), signed in at 1280×800, whose token writes the
 * documents, postings, runs and acceptances. `afterAll` revokes the admin's token (later files expect it to hold none)
 * and closes both browsers; users are never deleted, so the name is the file's own.
 */
export function journeyAccounts(baseUrl: string, adminPassword: string, prefix: string, tenant: Tenant) {
  const username = `${prefix}-ola`;
  const adminToken = `${prefix}-admin`;
  const secrets = { admin: "", user: "" };
  const context = {
    username,
    masters: journeyApi(baseUrl, () => secrets.admin, tenant),
    user: journeyApi(baseUrl, () => secrets.user, tenant),
  } as { username: string; admin: Browser; ola: Browser; masters: JourneyApi; user: JourneyApi };
  beforeAll(async () => {
    [context.admin, context.ola] = [openBrowser(), openBrowser()];
    await signInAsAdmin(context.admin, baseUrl, adminPassword);
    await openTokens(context.admin, baseUrl);
    secrets.admin = await createToken(context.admin, adminToken);
    const password = `${prefix} ola's first password`;
    await context.masters.post("/api/users", { username, password });
    await signInAs(context.ola, baseUrl, username, password);
    await openTokens(context.ola, baseUrl);
    secrets.user = await createToken(context.ola, `${prefix}-ola-cli`);
    await context.ola.setViewport(1280, 800);
  });
  afterAll(async () => {
    try {
      if (secrets.admin) {
        const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secrets.admin)).data as { id: string; name: string }[]).find(({ name }) => name === adminToken)!;
        const revoked = await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secrets.admin, { key: randomUUID() });
        expect(revoked.status, revoked.text).toBe(200);
      }
    } finally {
      await Promise.all([context.admin, context.ola].filter(Boolean).map((browser) => browser.close()));
    }
  });
  return context;
}
