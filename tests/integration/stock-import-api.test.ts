import { randomUUID } from "node:crypto";
import writeXlsxFile, { type Cell } from "write-excel-file/node";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "stockimportapi first password";
const HEADERS = ["Material ID", "Location ID", "Physical quantity", "Unit"];

/** A stock workbook, as base64, from its data rows; the header row is added. */
async function workbook(rows: Cell[][]): Promise<string> {
  return (await writeXlsxFile([{ sheet: "Stock", data: [HEADERS, ...rows] }]).toBuffer()).toString("base64");
}

interface Report {
  committed: boolean;
  previewToken: string | null;
  rows: { row: number; action: string; record: string; changes: { field: string; before: unknown; after: unknown }[] }[];
  errors: { row: number | null; column: string | null; code: string }[];
}

interface StockView {
  quantity: string;
  movements: { quantity: string; reason: string; actorUsername: string; channel: string; type: string; postingId: string }[];
}

// The stock import through the API (spec .ai/specs/2026-10-20--2225UTC-stock-import.md, R07): keyed and
// gated like every tenant write, for both roles. Everything is in Prod, on this file's own masters.
describe("the stock import through the API", () => {
  let admin: Browser;
  let adminSecret: string;
  let userSecret: string;
  let flint: string;
  let hide: string;
  let east: string;
  let west: string;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const dryRun = async (base64: string, secret = adminSecret) =>
    json(await write("POST", "/api/tenants/prod/stock-import/dry-run", { workbook: base64 }, secret)).data as Report;
  const commit = (base64: string, previewToken: string | null, reason: string | undefined, { key = randomUUID(), secret = adminSecret } = {}) =>
    api("POST", "/api/tenants/prod/stock-import/commit", { key, body: { workbook: base64, previewToken, reason } }, secret);
  const stock = async (material: string, location: string) =>
    json(await api("GET", `/api/tenants/prod/stock?material=${material}&location=${location}`)).data as StockView;

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "stockimportapi-ops");

    await write("POST", "/api/users", { username: "stockimportapi-bob", password: PASSWORD });
    const bob = openBrowser();
    try {
      await signIn(bob, baseUrl, PASSWORD, "stockimportapi-bob");
      await openTokens(bob, baseUrl);
      userSecret = await createToken(bob, "stockimportapi-bob-cli");
    } finally {
      await bob.close();
    }

    const material = async (description: string, baseUnit: string) =>
      json(await write("POST", "/api/tenants/prod/materials", { type: "raw", description, baseUnit })).data.id as string;
    flint = await material("stockimportapi flint", "each");
    hide = await material("stockimportapi hide", "kg");
    await write("POST", `/api/tenants/prod/materials/${flint}/conversions`, { unit: "case", numerator: "12", denominator: "1" });
    const location = async (name: string) => json(await write("POST", "/api/tenants/prod/locations", { name })).data.id as string;
    east = await location("stockimportapi east");
    west = await location("stockimportapi west");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "stockimportapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await admin.close();
  });

  it("serves the stock template to a bearer token and to the signed-in browser (STX-001)", async () => {
    const response = await fetch(`${baseUrl}/api/stock-import/template`, { headers: { authorization: `Bearer ${userSecret}` } });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");

    await admin.open(`${baseUrl}/admin`);
    expect(
      await admin.evaluate<string>(`fetch("/api/stock-import/template").then((r) => r.status + " " + r.headers.get("content-disposition"))`),
    ).toBe('200 attachment; filename="cpg-stock-template.xlsx"');
  });

  it("lets a normal user set opening balances once per key, as ordinary corrections (STX-002, STX-018, API-028)", async () => {
    const base64 = await workbook([[flint, east, 100, null], [hide, east, 40, "kg"], [flint, west, 2, "case"]]);
    const preview = await dryRun(base64, userSecret);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((row) => [row.record, row.action])).toEqual([
      [`${flint}/${east}`, "update"],
      [`${hide}/${east}`, "update"],
      [`${flint}/${west}`, "update"],
    ]);
    expect((await stock(flint, east)).quantity).toBe("0.000000");

    const key = randomUUID();
    const first = await commit(base64, preview.previewToken, "Opening balance", { key, secret: userSecret });
    const replay = await commit(base64, preview.previewToken, "Opening balance", { key, secret: userSecret });

    expect(first.status).toBe(200);
    expect(json(first).data).toMatchObject({ committed: true, previewToken: null });
    expect(replay.replayed).toBe("true");
    expect(json(replay)).toEqual(json(first));
    const opening = await stock(flint, east);
    expect(opening.quantity).toBe("100.000000");
    expect(opening.movements).toEqual([
      expect.objectContaining({ quantity: "100.000000", type: "correction", reason: "Opening balance", actorUsername: "stockimportapi-bob", channel: "api" }),
    ]);
    expect((await stock(flint, west)).quantity).toBe("24.000000");
    expect((await stock(hide, east)).movements[0].postingId).toBe(opening.movements[0].postingId);
  });

  it("moves listed positions to their counted balance and leaves the others alone (STX-003, STX-004, STX-006…009)", async () => {
    const base64 = await workbook([[flint, east, 85, null], [hide, east, 0, null], [flint, west, 24, null]]);
    const preview = await dryRun(base64);
    expect(preview.rows.map((row) => row.action)).toEqual(["update", "update", "unchanged"]);
    expect(preview.rows[0].changes).toContainEqual({ field: "Movement", before: null, after: "-15.000000 each" });

    expect((await commit(base64, preview.previewToken, "Stock count 2027-01")).status).toBe(200);

    expect((await stock(flint, east)).quantity).toBe("85.000000");
    expect((await stock(hide, east)).quantity).toBe("0.000000");
    expect((await stock(flint, west)).movements).toHaveLength(1);
  });

  it("refuses a commit whose balance changed after the dry run, keeping the other posting (STX-016)", async () => {
    const base64 = await workbook([[flint, east, 70, null]]);
    const preview = await dryRun(base64);
    await write("POST", "/api/tenants/prod/stock/corrections", { material: flint, location: east, quantity: "-10", unit: "each", reason: "stockimportapi issue" });

    const stale = await commit(base64, preview.previewToken, "Stock count");

    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("IMPORT_STALE");
    expect((await stock(flint, east)).quantity).toBe("75.000000");
  });

  it("refuses a commit without a reason, and reports bad rows instead of a token (STX-010…014)", async () => {
    const valid = await workbook([[flint, east, 75, null]]);
    const missing = await commit(valid, (await dryRun(valid)).previewToken, undefined);
    expect(missing.status).toBe(400);
    expect(Object.keys(json(missing).error.fieldErrors)).toEqual(["reason"]);

    const bad = await dryRun(await workbook([[flint, east, -1, null], ["99999999", east, 1, null], [hide, west, 1, null], [hide, west, 2, null]]));
    expect(bad.previewToken).toBeNull();
    expect(bad.errors.map((error) => [error.row, error.code])).toEqual([
      [2, "VALIDATION_FAILED"],
      [3, "IMPORT_MISSING_REFERENCE"],
      [4, "IMPORT_DUPLICATE_KEY"],
      [5, "IMPORT_DUPLICATE_KEY"],
    ]);
  });

  it("asks Test for its current generation", async () => {
    const missing = await write("POST", "/api/tenants/test/stock-import/dry-run", { workbook: await workbook([["00000001", "00000001", 1, null]]) });
    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");
  });

  it("refuses a dry run and a commit in a read-only tenant, and writes nothing (STX-019)", async () => {
    const base64 = await workbook([[flint, east, 1, null]]);
    const preview = await dryRun(base64);
    await write("PATCH", "/api/tenants/prod", { readOnly: true });
    try {
      const refused = [await write("POST", "/api/tenants/prod/stock-import/dry-run", { workbook: base64 }), await commit(base64, preview.previewToken, "Count")];
      for (const response of refused) {
        expect(response.status).toBe(409);
        expect(json(response).error.code).toBe("TENANT_READ_ONLY");
      }
    } finally {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
    }
    expect((await stock(flint, east)).quantity).toBe("75.000000");
  });
});
