import { randomUUID } from "node:crypto";
import writeXlsxFile, { type Cell } from "write-excel-file/node";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

const PASSWORD = "importapi first password";

/** The template's headers of the sheets this file writes. */
const HEADERS: Record<string, string[]> = {
  Materials: ["ID", "Type", "Description", "Base unit", "Active"],
  Locations: ["ID", "Name", "Active"],
  "BOM headers": ["BOM ID", "Import reference", "Output material ID", "Priority", "Valid from", "Valid through", "Active"],
  "BOM lines": ["BOM", "Component material ID", "Quantity", "Unit"],
};

/** A workbook, as base64, from sheet names and their data rows; the header rows are added. */
async function workbook(sheets: Record<string, Cell[][]>): Promise<string> {
  const file = await writeXlsxFile(Object.entries(sheets).map(([sheet, rows]) => ({ sheet, data: [HEADERS[sheet], ...rows] }))).toBuffer();
  return file.toString("base64");
}

interface Report {
  committed: boolean;
  previewToken: string | null;
  rows: { sheet: string; row: number; action: string; record: string; reference?: string; changes: { field: string; before: unknown; after: unknown }[] }[];
  errors: { sheet: string; row: number; column: string | null; code: string }[];
}

// The import through the API (spec .ai/specs/implemented/2026-10-20--0908UTC-master-data-bom-import.md, R07):
// keyed, gated and admin-only like every tenant write. Everything is in Prod, by this file's own names.
describe("the master-data and BOM import through the API", () => {
  let admin: Browser;
  let adminSecret: string;

  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, secret = adminSecret) =>
    callApi(baseUrl, method, path, secret, options);
  const write = (method: string, path: string, body: unknown, secret = adminSecret) => api(method, path, { key: randomUUID(), body }, secret);
  const dryRun = async (base64: string) => json(await write("POST", "/api/tenants/prod/import/dry-run", { workbook: base64 })).data as Report;
  const commit = (base64: string, previewToken: string, key = randomUUID()) =>
    api("POST", "/api/tenants/prod/import/commit", { key, body: { workbook: base64, previewToken } });
  const materials = async () => json(await api("GET", "/api/tenants/prod/materials")).data as { id: string; description: string; version: number }[];
  const material = async (description: string) => (await materials()).find((each) => each.description === description);

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    adminSecret = await createToken(admin, "importapi-ops");
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await api("GET", "/api/tokens")).data as { id: string; name: string }[]).find((token) => token.name === "importapi-ops")!;
    await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    await admin.close();
  });

  it("serves the template to a bearer token and to the signed-in browser", async () => {
    const response = await fetch(`${baseUrl}/api/import/template`, { headers: { authorization: `Bearer ${adminSecret}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2).toString()).toBe("PK");

    await admin.open(`${baseUrl}/admin`);
    expect(
      await admin.evaluate<string>(`fetch("/api/import/template").then((r) => r.status + " " + r.headers.get("content-disposition"))`),
    ).toBe('200 attachment; filename="cpg-import-template.xlsx"');
  });

  it("previews new records without writing them, then commits them once per key (XLS-002, XLS-010, API-028)", async () => {
    const base64 = await workbook({
      Materials: [
        [null, "raw", "importapi steel", "kg", null],
        [null, "intermediate", "importapi panel", "each", null],
      ],
      Locations: [[null, "importapi cave", null]],
    });

    const preview = await dryRun(base64);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map((row) => [row.sheet, row.action])).toEqual([
      ["Materials", "create"],
      ["Materials", "create"],
      ["Locations", "create"],
    ]);
    expect(await material("importapi steel")).toBeUndefined();
    expect(await material("importapi panel")).toBeUndefined();
    const locations = json(await api("GET", "/api/tenants/prod/locations")).data as { name: string }[];
    expect(locations.map(({ name }) => name)).not.toContain("importapi cave");

    const key = randomUUID();
    const first = await commit(base64, preview.previewToken!, key);
    const replay = await commit(base64, preview.previewToken!, key);

    expect(first.status).toBe(200);
    expect(replay.replayed).toBe("true");
    expect(json(replay)).toEqual(json(first));
    const report = json(first).data as Report;
    expect(report).toMatchObject({ committed: true, previewToken: null });
    expect(report.rows.map((row) => row.record)).toEqual(preview.rows.map((row) => row.record));
    expect((await materials()).filter((each) => each.description === "importapi steel")).toHaveLength(1);
    expect((await material("importapi steel"))!.id).toBe(preview.rows[0].record);
  });

  it("refuses the commit when the material it updates was edited in between, keeping that edit (XLS-014)", async () => {
    const steel = (await material("importapi steel"))!;
    const base64 = await workbook({ Materials: [[steel.id, "raw", "importapi steel 2 mm", "kg", null]] });
    const preview = await dryRun(base64);
    expect(preview.rows[0]).toMatchObject({ action: "update", record: steel.id });

    await write("PATCH", `/api/tenants/prod/materials/${steel.id}`, { version: steel.version, description: "importapi steel edited" });
    const stale = await commit(base64, preview.previewToken!);

    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("IMPORT_STALE");
    expect((await materials()).find((each) => each.id === steel.id)!.description).toBe("importapi steel edited");
  });

  it("creates a BOM through its import reference, then revises it when a line is left out (XLS-018, XLS-021)", async () => {
    const steel = (await material("importapi steel edited"))!.id;
    const panel = (await material("importapi panel"))!.id;
    const bolt = json(await write("POST", "/api/tenants/prod/materials", { type: "raw", description: "importapi bolt", baseUnit: "each" })).data.id;

    const create = await workbook({
      "BOM headers": [[null, "IMPORTAPI-PANEL", panel, 1, "2027-01-01", null, null]],
      "BOM lines": [
        ["IMPORTAPI-PANEL", steel, 2, "kg"],
        ["IMPORTAPI-PANEL", bolt, 4, null],
      ],
    });
    const created = json(await commit(create, (await dryRun(create)).previewToken!)).data as Report;
    const bomId = created.rows[0].record;
    expect(created.rows[0]).toMatchObject({ action: "create", reference: "IMPORTAPI-PANEL" });
    expect(json(await api("GET", `/api/tenants/prod/boms/${bomId}`)).data).toMatchObject({ output: panel, revision: 1 });

    const revise = await workbook({
      "BOM headers": [[bomId, null, null, 1, "2027-01-01", null, null]],
      "BOM lines": [[bomId, steel, 2, "kg"]],
    });
    const preview = await dryRun(revise);
    expect(preview.rows[0]).toMatchObject({ action: "update", record: bomId });
    expect(preview.rows[0].changes).toContainEqual({ field: `Component ${bolt}`, before: "4.000000 each", after: null });
    await commit(revise, preview.previewToken!);
    const bom = json(await api("GET", `/api/tenants/prod/boms/${bomId}`)).data;
    expect(bom).toMatchObject({ revision: 2, components: [{ material: steel }] });
    expect(json(await api("GET", `/api/tenants/prod/boms/${bomId}/revisions/1`)).data.components).toHaveLength(2);
  });

  it("keeps the key of a dry run whose middle row fails, and writes nothing (XLS-010)", async () => {
    const base64 = await workbook({
      Materials: [
        [null, "raw", "importapi first", "kg", null],
        ["99999998", "raw", "importapi unknown", "kg", null],
        [null, "raw", "importapi third", "kg", null],
      ],
    });
    const key = randomUUID();
    const first = await api("POST", "/api/tenants/prod/import/dry-run", { key, body: { workbook: base64 } });
    const replay = await api("POST", "/api/tenants/prod/import/dry-run", { key, body: { workbook: base64 } });

    expect((json(first).data as Report).errors).toEqual([expect.objectContaining({ row: 3, column: "ID", code: "IMPORT_UNKNOWN_ID" })]);
    expect(replay.replayed).toBe("true");
    expect(await material("importapi first")).toBeUndefined();
    expect(await material("importapi third")).toBeUndefined();
  });

  it("asks Test for its current generation (API-034)", async () => {
    const base64 = await workbook({ Locations: [[null, "importapi gated", null]] });
    const missing = await write("POST", "/api/tenants/test/import/dry-run", { workbook: base64 });
    expect(missing.status).toBe(428);
    expect(json(missing).error.code).toBe("GENERATION_REQUIRED");

    const generation = (json(await api("GET", "/api/tenants/test")).data as { generation: number }).generation;
    const stale = await api("POST", "/api/tenants/test/import/dry-run", { key: randomUUID(), body: { workbook: base64 }, generation: generation + 1 });
    expect(stale.status).toBe(409);
    expect(json(stale).error.code).toBe("GENERATION_STALE");
  });

  it("refuses a dry run and a commit in a read-only tenant, and writes nothing (XLS-015)", async () => {
    const base64 = await workbook({ Locations: [[null, "importapi read-only", null]] });
    const preview = await dryRun(base64);
    expect(preview.errors).toEqual([]);

    await write("PATCH", "/api/tenants/prod", { readOnly: true });
    try {
      const refused = [
        await write("POST", "/api/tenants/prod/import/dry-run", { workbook: base64 }),
        await commit(base64, preview.previewToken!),
      ];
      for (const response of refused) {
        expect(response.status).toBe(409);
        expect(json(response).error.code).toBe("TENANT_READ_ONLY");
      }
    } finally {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
    }
    const locations = json(await api("GET", "/api/tenants/prod/locations")).data as { name: string }[];
    expect(locations.map(({ name }) => name)).not.toContain("importapi read-only");
  });

  it("refuses a normal user's token", async () => {
    await write("POST", "/api/users", { username: "importapi-una", password: PASSWORD });
    const una = openBrowser();
    try {
      await signIn(una, baseUrl, PASSWORD, "importapi-una");
      await openTokens(una, baseUrl);
      const unaSecret = await createToken(una, "importapi-una-cli");
      const refused = await write("POST", "/api/tenants/prod/import/dry-run", { workbook: await workbook({ Locations: [[null, "x", null]] }) }, unaSecret);
      expect(refused.status).toBe(403);
      expect(json(refused).error.code).toBe("FORBIDDEN");
    } finally {
      await una.close();
    }
  });

  it("dry-runs a 2,000-row workbook within the lock budget (spec Risks: measured, not assumed)", async () => {
    const rows = Array.from({ length: 2000 }, (_, index): Cell[] => [null, `importapi bulk ${index}`, null]);
    const base64 = await workbook({ Locations: rows });
    const started = performance.now();
    const preview = await dryRun(base64);
    const elapsed = Math.round(performance.now() - started);

    // Straight to stdout: Vitest drops a passing test's console output.
    process.stdout.write(`2,000-row dry run: ${elapsed} ms\n`);
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(2000);
    // CI measured about 2.6 s; the bound keeps 4× headroom on shared runners (#192) and still catches the
    // 17.9 s the dry run took before the identity map was cleared after every row.
    expect(elapsed).toBeLessThan(12_000);
  });
});
