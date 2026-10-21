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
const kinds = ["materials", "locations", "customers", "suppliers", "planning-parameters", "safety-stock-targets", "boms", "customer-orders"];
interface Tenant { code: string; generation: number; readOnly: boolean }
interface Material { id: string; version: number; description: string }
interface AuditPage { entries: { id: string; action: string; actor: { username: string }; channel: string; token: { name: string } | null }[] }

describe("atomic Test reset through the bearer API", () => {
  let admin: Browser;
  const people: Browser[] = [];
  let secret: string;
  const userSecrets: string[] = [];
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, token = secret) => callApi(baseUrl, method, path, token, options);
  const write = (method: string, path: string, body: unknown, generation?: number) => api(method, path, { key: randomUUID(), body, generation });
  const test = async () => json(await api("GET", "/api/tenants/test")).data as Tenant;
  const materials = async () => json(await api("GET", "/api/tenants/test/materials")).data as Material[];

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
    await api("PATCH", "/api/preferences", { key: randomUUID(), body: { locale: "pl", theme: "dark" } }, userSecrets[0]);
    expect((await write("PATCH", "/api/tenants/test", { readOnly: false })).status).toBe(200);
    expect((await write("POST", "/api/tenants/prod/materials", { type: "raw", description: "reset-api keep Prod", baseUnit: "kg" })).status).toBe(200);
  });
  afterAll(async () => {
    try {
      if (secret) {
        await write("PATCH", "/api/tenants/test", { readOnly: false });
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
    const cookie = (await admin.cookies()).map(({ name, value }) => `${name}=${value}`).join("; ");
    expect((await fetch(`${baseUrl}/api/tenants/test/reset`, { method: "POST", headers: { cookie, "Idempotency-Key": randomUUID(), "Dataset-Generation": String(generation) }, body: "{}" })).status).toBe(401);
    expect((await write("POST", "/api/tenants/prod/reset", {}, 1)).status).toBe(404);
    expect((await test()).generation).toBe(generation);
  });

  it.each([false, true])("resets with readOnly=%s, preserving Prod/accounts/sessions/tokens/preferences and the Global audit (TEN-022, TEN-023, TEN-024, TEN-028, AUD-011…013, API-017)", async (readOnly) => {
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
    const prodBefore = await Promise.all(kinds.map(async (kind) => json(await api("GET", `/api/tenants/prod/${kind}`)).data));
    const prodMeta = json(await api("GET", "/api/tenants/prod")).data;
    const prodAudit = json(await api("GET", "/api/tenants/prod/audit")).data;
    const accountsBefore = (json(await api("GET", "/api/users")).data as { username: string }[]).filter(({ username }) => users.includes(username));
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
    // The dataset's orders fill more than a page; the first is 00000001 again.
    const orders = json(await api("GET", "/api/tenants/test/customer-orders")).data as { id: string }[];
    expect(orders).toHaveLength(100);
    expect(orders[0].id).toBe("00000001");
    expect((await api("GET", `/api/tenants/test/customer-orders/${extraId}`)).status).toBe(404);
    for (const kind of ["locations", "customers", "suppliers", "boms"]) {
      const rows = json(await api("GET", `/api/tenants/test/${kind}`)).data as { id: string }[];
      expect(rows[0].id, kind).toBe("00000001");
    }
    expect((json(await api("GET", "/api/tenants/test/audit")).data as AuditPage).entries).toEqual([]);
    expect(await Promise.all(kinds.map(async (kind) => json(await api("GET", `/api/tenants/prod/${kind}`)).data))).toEqual(prodBefore);
    expect(json(await api("GET", "/api/tenants/prod")).data).toEqual(prodMeta);
    expect(json(await api("GET", "/api/tenants/prod/audit")).data).toEqual(prodAudit);
    expect((json(await api("GET", "/api/users")).data as { username: string }[]).filter(({ username }) => users.includes(username))).toEqual(accountsBefore);
    expect(await Promise.all(userSecrets.map(async (token) => json(await api("GET", "/api/preferences", {}, token)).data))).toEqual(preferences);
    for (const token of userSecrets) expect(json(await api("GET", "/api/tokens", {}, token)).data).toEqual(expect.arrayContaining([expect.objectContaining({ name: "reset-survivor" })]));
    for (const [index, browser] of people.entries()) {
      await browser.open(`${baseUrl}/admin`);
      await browser.waitUntil(signedInAs(users[index]));
      expect(await browser.evaluate<string>(`document.querySelector('[data-signed-in-as]').dataset.signedInAs`)).toBe(users[index]);
    }
    const globalAfter = (json(await api("GET", "/api/audit?limit=100")).data as AuditPage).entries;
    expect(globalAfter[0]).toMatchObject({ action: "tenants.tenant.reset", actor: { username: "admin" }, channel: "api", token: { name: "reset-api-admin" } });
    expect(globalAfter.map(({ id }) => id)).toEqual(expect.arrayContaining(globalBefore.slice(0, 99).map(({ id }) => id)));
    const replay = await api("POST", "/api/tenants/test/reset", { key, body: {}, generation: generation + 1 });
    expect(replay.replayed).toBe("true"); expect(replay.text).toBe(first.text);
    expect((await api("POST", "/api/tenants/test/reset", { key, body: {}, generation })).status).toBe(409);
    const staleWrite = await api("PATCH", `/api/tenants/test/materials/${firstMaterial.id}`, { key: oldKey, body: oldBody, generation });
    expect(json(staleWrite).error.code).toBe("GENERATION_STALE");
    expect(json(await write("PATCH", `/api/tenants/test/materials/${firstMaterial.id}`, oldBody, generation)).error.code).toBe("GENERATION_STALE");
    await write("PATCH", "/api/tenants/test", { readOnly: false });
    const staleImport = await write("POST", "/api/tenants/test/import/commit", { workbook, previewToken: preview.previewToken }, generation + 1);
    expect(json(staleImport).error.code).toBe("IMPORT_STALE");
    const reused = await api("POST", "/api/tenants/test/materials", { key: oldKey, body: { type: "raw", description: "reset-api new generation", baseUnit: "kg" }, generation: generation + 1 });
    expect(reused.status).toBe(200); expect(json(reused).data.id).toBe("00000027");
  });
});
