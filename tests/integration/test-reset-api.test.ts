import { randomUUID } from "node:crypto";
import writeXlsxFile from "write-excel-file/node";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin, signedInAs } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const password = inject("adminPassword");
const userPassword = "reset integration password";
const users = [`reset-a-${randomUUID().slice(0, 8)}`, `reset-b-${randomUUID().slice(0, 8)}`];
/** Every tenant list a reset of Test must leave alone in Prod. */
const kinds = ["materials", "locations", "customers", "suppliers", "planning-parameters", "safety-stock-targets", "boms", "customer-orders",
  "shipments", "goods-issues", "purchase-requisitions", "purchase-orders", "goods-receipts", "production-orders", "transfers"];
/** The sequenced kinds the tiny dataset writes, each listed whole on one page; completions are listed per production order. */
const sequenced = ["materials", "locations", "customers", "suppliers", "boms", "customer-orders", "shipments", "goods-issues",
  "purchase-requisitions", "purchase-orders", "goods-receipts", "production-orders"];
const sequence = (count: number) => Array.from({ length: count }, (_, index) => String(index + 1).padStart(8, "0"));
const today = () => new Date().toISOString().slice(0, 10);
interface Tenant { code: string; generation: number; readOnly: boolean }
interface Material { id: string; version: number; description: string }
interface AuditPage { entries: { id: string; action: string; actor: { username: string }; channel: string; token: { name: string } | null; after: Record<string, unknown> | null }[] }

describe("atomic Test reset through the bearer API", () => {
  let admin: Browser;
  const people: Browser[] = [];
  let secret: string;
  const userSecrets: string[] = [];
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, token = secret) => callApi(baseUrl, method, path, token, options);
  const write = (method: string, path: string, body: unknown, generation?: number) => api(method, path, { key: randomUUID(), body, generation });
  const test = async () => json(await api("GET", "/api/tenants/test")).data as Tenant;
  const materials = async () => json(await api("GET", "/api/tenants/test/materials")).data as Material[];
  const get = async (path: string) => json(await api("GET", path)).data;
  const created = async (path: string, body: unknown, generation?: number) => {
    const response = await write("POST", path, body, generation);
    expect(response.status, `${path}: ${response.text}`).toBe(200);
    return json(response).data;
  };
  /** Prod's own records for TEN-025: stock at a source, a transfer in transit to a destination, an open purchase order. */
  const prod = {} as Record<"material" | "source" | "destination" | "supplier" | "transfer" | "order", string>;
  /** Everything of Prod's a Test reset must not touch. */
  const prodState = async () => ({
    lists: await Promise.all(kinds.map((kind) => get(`/api/tenants/prod/${kind}`))),
    tenant: await get("/api/tenants/prod"),
    audit: await get("/api/tenants/prod/audit"),
    transfer: await get(`/api/tenants/prod/transfers/${prod.transfer}`),
    order: await get(`/api/tenants/prod/purchase-orders/${prod.order}`),
    stock: await Promise.all([prod.source, prod.destination].map((location) => get(`/api/tenants/prod/stock?material=${prod.material}&location=${location}`))),
  });
  const accounts = async () => (await get("/api/users") as { username: string }[]).filter(({ username }) => users.includes(username));

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, password);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, "reset-api-admin");
    for (const username of users) {
      expect((await write("POST", "/api/users", { username, password: userPassword })).status).toBe(200);
      const browser = openBrowser(); people.push(browser);
      await signInAs(browser, baseUrl, username, userPassword);
      await openTokens(browser, baseUrl);
      userSecrets.push(await createToken(browser, "reset-survivor"));
    }
    expect((await api("PATCH", "/api/preferences", { key: randomUUID(), body: { locale: "pl", theme: "dark" } }, userSecrets[0])).status).toBe(200);
    expect((await write("PATCH", "/api/tenants/test", { readOnly: false })).status).toBe(200);
    prod.material = (await created("/api/tenants/prod/materials", { type: "raw", description: "reset-api keep Prod", baseUnit: "kg" })).id;
    prod.source = (await created("/api/tenants/prod/locations", { name: "reset-api source" })).id;
    prod.destination = (await created("/api/tenants/prod/locations", { name: "reset-api destination" })).id;
    prod.supplier = (await created("/api/tenants/prod/suppliers", { name: "reset-api supplier" })).id;
    await created("/api/tenants/prod/stock/corrections", { material: prod.material, location: prod.source, quantity: "10", unit: "kg", reason: "reset-api count" });
    prod.transfer = (await created("/api/tenants/prod/transfers", { material: prod.material, source: prod.source, destination: prod.destination,
      quantity: "4", unit: "kg", plannedDispatch: today(), plannedArrival: today() })).id;
    await created(`/api/tenants/prod/transfers/${prod.transfer}/dispatches`, { quantity: "4", unit: "kg" });
    prod.order = (await created("/api/tenants/prod/purchase-orders", { supplier: prod.supplier, location: prod.source,
      lines: [{ material: prod.material, quantity: "5", unit: "kg", plannedDate: "2027-01-01" }] })).id;
  });
  afterAll(async () => {
    try {
      if (secret) {
        await write("PATCH", "/api/tenants/test", { readOnly: false });
        await write("PATCH", "/api/tenants/prod", { readOnly: false });
        const tokens = json(await api("GET", "/api/tokens")).data as { id: string; name: string }[];
        const own = tokens.find((token) => token.name === "reset-api-admin");
        if (own) await write("DELETE", `/api/tokens/${own.id}`, null);
      }
    } finally { await Promise.all([admin, ...people].map((browser) => browser.close())); }
  });

  it("denies normal accounts, cookie-only calls, missing keys/generations and any Prod reset", async () => {
    const generation = (await test()).generation;
    expect((await api("POST", "/api/tenants/test/reset", { key: randomUUID(), body: {}, generation }, userSecrets[0])).status).toBe(403);
    expect((await write("POST", "/api/tenants/test/reset", {})).status).toBe(428);
    expect((await api("POST", "/api/tenants/test/reset", { body: {}, generation })).status).toBe(400);
    expect((await write("POST", "/api/tenants/test/reset", { tenant: "prod" }, generation)).status).toBe(400);
    expect((await write("POST", "/api/tenants/test/reset", { dataset: "huge" }, generation)).status).toBe(400);
    const cookie = (await admin.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
    expect((await fetch(`${baseUrl}/api/tenants/test/reset`, { method: "POST", headers: { cookie, "Idempotency-Key": randomUUID(), "Dataset-Generation": String(generation) }, body: "{}" })).status).toBe(401);
    expect((await write("POST", "/api/tenants/prod/reset", {}, 1)).status).toBe(404);
    expect((await test()).generation).toBe(generation);
  });

  it.each([false, true])("resets with readOnly=%s, restarting every sequence and preserving Prod/accounts/sessions/tokens/preferences and the Global audit (TEN-022…025, TEN-028, TEN-029, AUD-011…013, API-017, E2E-018)", async (readOnly) => {
    await write("PATCH", "/api/tenants/test", { readOnly: false });
    const generation = (await test()).generation;
    const demoOrder = json(await api("GET", "/api/tenants/test/customer-orders/00000001")).data;
    const extraOrder = await write("POST", "/api/tenants/test/customer-orders", { customer: demoOrder.customer, location: demoOrder.location,
      lines: [{ material: demoOrder.lines[0].material, quantity: "1", unit: "each", requiredDate: "2027-01-01" }] }, generation);
    expect(extraOrder.status).toBe(200);
    const extraId = json(extraOrder).data.id;
    const firstMaterial = (await materials())[0];
    const oldKey = randomUUID();
    const oldBody = { version: firstMaterial.version, description: "reset-api old dataset" };
    expect((await api("PATCH", `/api/tenants/test/materials/${firstMaterial.id}`, { key: oldKey, body: oldBody, generation })).status).toBe(200);
    const workbook = (await writeXlsxFile([{ sheet: "Materials", data: [["ID", "Type", "Description", "Base unit", "Active"], [null, "raw", "reset-api old preview", "kg", null]] }]).toBuffer()).toString("base64");
    const preview = json(await write("POST", "/api/tenants/test/import/dry-run", { workbook }, generation)).data as { previewToken: string };
    expect(preview.previewToken).toMatch(/^[a-f0-9]{64}$/);
    await write("PATCH", "/api/tenants/test", { readOnly });
    // Prod shares the flag, so its read-only state is compared both ways; other files expect it writable again (TEN-025).
    expect((await write("PATCH", "/api/tenants/prod", { readOnly })).status).toBe(200);
    const prodBefore = await prodState();
    // Prod holds stock, a transfer in transit and an open purchase order (TEN-025).
    expect(prodBefore.tenant).toMatchObject({ code: "prod", readOnly });
    expect(prodBefore.stock.map(({ quantity }: { quantity: string }) => quantity)).toEqual(["6.000000", "0.000000"]);
    expect(prodBefore.transfer).toMatchObject({ id: prod.transfer, inTransit: "4.000000" });
    expect(prodBefore.order).toMatchObject({ id: prod.order, status: "open" });
    const accountsBefore = await accounts();
    const preferences = await Promise.all(userSecrets.map(async (token) => json(await api("GET", "/api/preferences", {}, token)).data));
    const globalBefore = (json(await api("GET", "/api/audit?limit=100")).data as AuditPage).entries;
    const key = randomUUID();
    const first = await api("POST", "/api/tenants/test/reset", { key, body: {}, generation });
    expect(first.status).toBe(200);
    expect(json(first).data).toMatchObject({ code: "test", generation: generation + 1, readOnly });
    expect(await test()).toMatchObject({ generation: generation + 1, readOnly });
    const fresh = await materials();
    expect(fresh[0]).toMatchObject({ id: "00000001", description: "Steel sheet 2 mm" });
    expect(fresh).toHaveLength(26);
    expect((await api("GET", `/api/tenants/test/customer-orders/${extraId}`)).status).toBe(404);
    // A reset that names no dataset writes the tiny one, less than a page of each kind; every sequence starts again at 00000001, with no gap (TEN-029).
    for (const kind of sequenced) {
      const ids = (await get(`/api/tenants/test/${kind}`) as { id: string }[]).map(({ id }) => id).sort();
      expect(ids.length, kind).toBeGreaterThan(0);
      expect(ids.length, kind).toBeLessThan(100);
      expect(ids, kind).toEqual(sequence(ids.length));
    }
    const productionOrders = (await get("/api/tenants/test/production-orders") as { id: string }[]).map(({ id }) => id);
    const completions = (await Promise.all(productionOrders.map((id) => get(`/api/tenants/test/production-orders/${id}/completions`) as Promise<{ id: string }[]>)))
      .flat().map(({ id }) => id).sort();
    expect(completions.length).toBeGreaterThan(0);
    expect(completions).toEqual(sequence(completions.length));
    // The tiny dataset has no transfers; the first one a client creates is 00000001 (E2E-020 below).
    expect(await get("/api/tenants/test/transfers")).toEqual([]);
    expect((json(await api("GET", "/api/tenants/test/audit")).data as AuditPage).entries).toEqual([]);
    expect(await prodState()).toEqual(prodBefore);
    expect(await accounts()).toEqual(accountsBefore);
    expect(await Promise.all(userSecrets.map(async (token) => json(await api("GET", "/api/preferences", {}, token)).data))).toEqual(preferences);
    for (const token of userSecrets) expect(json(await api("GET", "/api/tokens", {}, token)).data).toEqual(expect.arrayContaining([expect.objectContaining({ name: "reset-survivor" })]));
    for (const [index, browser] of people.entries()) {
      await browser.open(`${baseUrl}/admin`);
      await browser.waitUntil(signedInAs(users[index]));
      expect(await browser.evaluate<string>(`document.querySelector('[data-signed-in-as]').dataset.signedInAs`)).toBe(users[index]);
    }
    // E2E-018: the user who chose Polish and dark still reads the app, and its help, in Polish and dark.
    const [polish] = people;
    await polish.waitUntil(`document.documentElement.lang === "pl" && document.documentElement.classList.contains("dark")`);
    await polish.waitFor("nav a[href='/help']");
    expect(await polish.text("nav a[href='/help']")).toBe("Pomoc");
    await polish.open(`${baseUrl}/help`);
    await polish.waitFor("section#signing-in");
    expect(await polish.text("main h1")).toBe("Pomoc");
    expect(await polish.evaluate<boolean>(`document.documentElement.classList.contains("dark")`)).toBe(true);
    const globalAfter = (json(await api("GET", "/api/audit?limit=100")).data as AuditPage).entries;
    expect(globalAfter[0]).toMatchObject({ action: "tenants.tenant.reset", actor: { username: "admin" }, channel: "api", token: { name: "reset-api-admin" }, after: { dataset: "tiny" } });
    expect(globalAfter.map(({ id }) => id)).toEqual(expect.arrayContaining(globalBefore.slice(0, 99).map(({ id }) => id)));
    const replay = await api("POST", "/api/tenants/test/reset", { key, body: {}, generation: generation + 1 });
    expect(replay.replayed).toBe("true"); expect(replay.text).toBe(first.text);
    expect((await api("POST", "/api/tenants/test/reset", { key, body: {}, generation })).status).toBe(409);
    const staleWrite = await api("PATCH", `/api/tenants/test/materials/${firstMaterial.id}`, { key: oldKey, body: oldBody, generation });
    expect(json(staleWrite).error.code).toBe("GENERATION_STALE");
    expect(json(await write("PATCH", `/api/tenants/test/materials/${firstMaterial.id}`, oldBody, generation)).error.code).toBe("GENERATION_STALE");
    await write("PATCH", "/api/tenants/test", { readOnly: false });
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: false })).status).toBe(200);
    const staleImport = await write("POST", "/api/tenants/test/import/commit", { workbook, previewToken: preview.previewToken }, generation + 1);
    expect(json(staleImport).error.code).toBe("IMPORT_STALE");
    const reused = await api("POST", "/api/tenants/test/materials", { key: oldKey, body: { type: "raw", description: "reset-api new generation", baseUnit: "kg" }, generation: generation + 1 });
    expect(reused.status).toBe(200); expect(json(reused).data.id).toBe("00000027");
  });

  it("lets a normal user post a Prod goods receipt while the admin resets Test; the receipt alone changes Prod (E2E-010)", async () => {
    await write("PATCH", "/api/tenants/test", { readOnly: false });
    const generation = (await test()).generation;
    // Test has its demo stock and an audit entry of its own to clear.
    const firstMaterial = (await materials())[0];
    expect((await write("PATCH", `/api/tenants/test/materials/${firstMaterial.id}`, { version: firstMaterial.version, description: "reset-api E2E-010" }, generation)).status).toBe(200);
    expect((json(await api("GET", "/api/tenants/test/audit")).data as AuditPage).entries.length).toBeGreaterThan(0);
    const before = await prodState();
    const accountsBefore = await accounts();

    // The receipt can wait several seconds behind the reset on a kept-alive connection: like `test-reset-realistic.test.ts`,
    // this relies on the image's `KEEP_ALIVE_TIMEOUT`, and a server started without it may close the connection unread (#185).
    const [reset, receipt] = await Promise.all([
      api("POST", "/api/tenants/test/reset", { key: randomUUID(), body: {}, generation }),
      api("POST", "/api/tenants/prod/goods-receipts", { key: randomUUID(), body: { purchaseOrder: prod.order, lines: [{ line: 1, quantity: "2", unit: "kg" }] } }, userSecrets[0]),
    ]);

    expect(reset.status, reset.text).toBe(200);
    expect(receipt.status, receipt.text).toBe(200);
    expect(await test()).toMatchObject({ generation: generation + 1, readOnly: false });
    expect((json(await api("GET", "/api/tenants/test/audit")).data as AuditPage).entries).toEqual([]);
    const fresh = await materials();
    expect(fresh.map(({ id }) => id)).toEqual(sequence(26));
    expect(fresh[0]).toMatchObject({ id: "00000001", description: "Steel sheet 2 mm" });
    const after = await prodState();
    // The receipt is posted once, by the user, at the order's location; the transfer, the destination and the accounts are untouched.
    expect(after.order.lines[0]).toMatchObject({ received: "2.000000" });
    expect(after.stock[0]).toMatchObject({ quantity: "8.000000", movementCount: before.stock[0].movementCount + 1 });
    expect(after.stock[0].movements[0]).toMatchObject({ quantity: "2.000000", balanceBefore: "6.000000", balanceAfter: "8.000000", actorUsername: users[0], channel: "api" });
    expect(after.stock[0].movements.slice(1)).toEqual(before.stock[0].movements);
    expect(after.stock[1]).toEqual(before.stock[1]);
    expect(after.transfer).toEqual(before.transfer);
    expect(after.tenant).toEqual(before.tenant);
    // Prod's audit only gained the receipt's own entries, the user's, newest first.
    const ids = (page: AuditPage) => page.entries.map(({ id }) => id);
    const added = (after.audit as AuditPage).entries.filter(({ id }) => !ids(before.audit).includes(id));
    expect(added.length).toBeGreaterThan(0);
    for (const entry of added) expect(entry).toMatchObject({ actor: { username: users[0] }, channel: "api" });
    expect(ids(after.audit)).toEqual([...added.map(({ id }) => id), ...ids(before.audit)].slice(0, after.audit.entries.length));
    expect(await accounts()).toEqual(accountsBefore);
  });

  it("refuses a goods issue an agent retries under the old generation after a reset; G2 stock, issues and Prod are unchanged and the token works on G2 (E2E-020)", async () => {
    await write("PATCH", "/api/tenants/test", { readOnly: false });
    const generation = (await test()).generation;
    // G1: the agent issues what is left on a line of an Open demo shipment, whose ID G2 reuses for the same plan.
    type Shipment = { id: string; location: string; status: string; lines: { line: number; material: string; toIssue: string }[] };
    const shipment = (await get("/api/tenants/test/shipments") as Shipment[]).find(({ status, lines }) => status === "open" && Number(lines[0].toIssue) > 0)!;
    expect(shipment).toBeDefined();
    const [{ line, material, toIssue }] = shipment.lines;
    const { location } = shipment;
    const { baseUnit } = await get(`/api/tenants/test/materials/${material}`);
    await created("/api/tenants/test/stock/corrections", { material, location, quantity: toIssue, unit: baseUnit, reason: "reset-api agent" }, generation);
    const key = randomUUID();
    const body = { shipment: shipment.id, lines: [{ line, quantity: toIssue, unit: baseUnit }] };
    expect((await api("POST", "/api/tenants/test/goods-issues", { key, body, generation })).status).toBe(200);

    expect((await write("POST", "/api/tenants/test/reset", {}, generation)).status).toBe(200);
    const g2 = async () => ({
      material: await get(`/api/tenants/test/materials/${material}`),
      stock: await get(`/api/tenants/test/stock?material=${material}&location=${location}`),
      issues: await get("/api/tenants/test/goods-issues"),
      shipment: await get(`/api/tenants/test/shipments/${shipment.id}`),
    });
    const before = await g2();
    // G2 has the same shipment again, nothing issued on it yet: a retry that got through would land on it.
    // Both generations are today's tiny dataset; a run that crosses midnight UTC fails here rather than passing on another plan.
    expect(before.shipment).toMatchObject({ id: shipment.id, location, status: "open", lines: expect.arrayContaining([expect.objectContaining({ line, material, toIssue })]) });
    const prodBefore = await prodState();

    // The agent retries its G1 request with the same key, and with a new one: both are refused before anything is written.
    for (const retry of [key, randomUUID()]) {
      const response = await api("POST", "/api/tenants/test/goods-issues", { key: retry, body, generation });
      expect(response.status).toBe(409);
      expect(json(response).error.code).toBe("GENERATION_STALE");
    }
    expect(await g2()).toEqual(before);
    expect(await prodState()).toEqual(prodBefore);
    // The same token is still good for G2: the first transfer of the new generation is 00000001.
    const destination = (await get("/api/tenants/test/locations") as { id: string }[]).find(({ id }) => id !== location)!.id;
    const transfer = await created("/api/tenants/test/transfers", { material, source: location, destination, quantity: "1", unit: baseUnit,
      plannedDispatch: today(), plannedArrival: today() }, generation + 1);
    expect(transfer.id).toBe("00000001");
  });
});
