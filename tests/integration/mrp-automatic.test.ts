import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json, untilOk } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const SETUP_TOKEN = "mrpauto-ui-setup";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]") && e.offsetParent !== null)`;
/** True once the shown `selector` is hydrated, so a click reaches React (lesson 2026-10-23). */
const ready = (selector: string) => `Boolean(${shown(selector)}) && Object.keys(${shown(selector)}).some((key) => key.startsWith("__reactFiber"))`;
const RUN_BUTTON = "main button[data-mrp-run]";
const DIALOG = "[data-mrp-run-dialog]";
const RUN_SUBMIT = `${DIALOG} button[data-mrp-run-submit]`;
const AUTOMATIC = `${DIALOG} label:has(input[value=automatic])`;
const field = (key: string) => `main [data-mrp-field=${key}]`;
const day = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/*
 * E19-S03 in a real browser: Run MRP asks for the creation mode, on Manual by default (RUN-003); Automatic, chosen
 * explicitly, creates the pair's requisition, and the card says what the batch did or why it created nothing
 * (RUN-007, RUN-023). An automatic run creates documents for every Test material, so Test is reset before and after.
 */
describe("automatic MRP runs on the MRP page", () => {
  let admin: Browser;
  let secret: string;
  let customer: string;

  const api = (method: string, path: string, options: { key?: string; body?: unknown; generation?: number } = {}) => callApi(baseUrl, method, path, secret, options);
  const generation = async () => (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
  const created = async (path: string, body: unknown) => {
    const response = await api("POST", path, { key: randomUUID(), body, generation: await generation() });
    expect(response.status, response.text).toBe(200);
    return json(response).data as { id: string; version: number };
  };
  const resetTest = async () => untilOk("reset Test", async () => api("POST", "/api/tenants/test/reset", { key: randomUUID(), body: {}, generation: await generation() }));
  const requisitionsOf = async (material: string) =>
    (json(await api("GET", `/api/tenants/test/purchase-requisitions?q=${material}`)).data as { id: string; material: string; mrpRun: string | null }[])
      .filter((requisition) => requisition.material === material);
  /** A Buy pair of its own in Test with one order line of `quantity` four days out. */
  async function buyPair(name: string, lines: string[]) {
    const material = (await created("/api/tenants/test/materials", { type: "raw", description: `mrpauto ui ${name}`, baseUnit: "kg" })).id;
    const location = (await created("/api/tenants/test/locations", { name: `mrpauto ui ${name} plant` })).id;
    await created("/api/tenants/test/planning-parameters", { material, location, procurement: "buy", leadTimeDays: 2, minimumQuantity: "0", lotMultiple: "1" });
    const order = await created("/api/tenants/test/customer-orders", { customer, location, lines: lines.map((quantity) => ({ material, quantity, unit: "kg", requiredDate: day(4) })) });
    return { material, location, order };
  }
  const text = (key: string) => admin.evaluate<string>(`${shown(field(key))}?.textContent ?? ""`);
  /** Runs MRP from the page in `mode`, and waits for the new run's card. */
  async function runFromPage(mode: "manual" | "automatic") {
    await admin.open(`${baseUrl}/admin/test/mrp`);
    await admin.waitUntil(ready(RUN_BUTTON));
    const before = await text("id");
    await admin.click(RUN_BUTTON);
    await admin.waitUntil(ready(RUN_SUBMIT));
    // The dialog opens on Manual every time (RUN-003).
    expect(await admin.evaluate<boolean>(`document.querySelector("${DIALOG} input[value=manual]").checked`)).toBe(true);
    if (mode === "automatic") await admin.click(AUTOMATIC);
    await admin.click(RUN_SUBMIT);
    await admin.waitUntil(`(${shown(field("id"))}?.textContent ?? "") !== ${JSON.stringify(before)} && !document.querySelector(${JSON.stringify(DIALOG)})`);
  }

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    await resetTest();
    customer = (await created("/api/tenants/test/customers", { name: "mrpauto ui retail" })).id;
  });
  afterAll(async () => {
    try {
      // Removes every document this file's batches created (spec Q12); later files expect the admin to hold no tokens.
      await resetTest();
      const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
      await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    } finally {
      await admin.close();
    }
  });

  it("RUN-003, RUN-007: a manual run creates nothing; Automatic, chosen in the dialog, creates the pair's requisition, which the card counts and the pair's proposals link", async () => {
    const sugar = await buyPair("sugar", ["50"]);

    await runFromPage("manual");
    expect(await text("creation")).toBe("Manual");
    expect(await requisitionsOf(sugar.material)).toEqual([]);

    await runFromPage("automatic");
    const runId = await text("id");
    expect(await text("creation")).toMatch(/^Automatic: \d+ documents? created$/);
    const [requisition] = await requisitionsOf(sugar.material);
    expect(requisition).toMatchObject({ mrpRun: runId });
    await admin.open(`${baseUrl}/admin/test/mrp?material=${sugar.material}&location=${sugar.location}`);
    await admin.waitUntil(`Boolean(${shown("[data-mrp-proposals] [data-mrp-document]")})`);
    expect(await admin.evaluate<string>(`${shown("[data-mrp-proposals] [data-mrp-document]")}.textContent`)).toContain(requisition.id);
  });

  it("RUN-023: a failed batch says why it created nothing, naming the candidate", async () => {
    const rice = await buyPair("rice", ["20"]);
    const bulk = await buyPair("bulk", ["999999999999", "999999999999"]);
    try {
      await runFromPage("automatic");

      expect(await text("creation")).toBe("Automatic: failed, nothing created");
      const failure = await admin.evaluate<string>(`${shown("main [data-mrp-creation-failure]")}.textContent`);
      expect(failure).toContain("The automatic batch created nothing.");
      expect(failure).toContain("The candidate's quantity is more than one document can hold.");
      expect(failure).toContain(`Candidate: purchase requisition for material ${bulk.material} at location ${bulk.location}`);
      expect(await requisitionsOf(rice.material)).toEqual([]);
    } finally {
      const cancelled = await api("POST", `/api/tenants/test/customer-orders/${bulk.order.id}/cancel`, {
        key: randomUUID(), body: { version: bulk.order.version }, generation: await generation(),
      });
      expect(cancelled.status, cancelled.text).toBe(200);
    }
  });
});
