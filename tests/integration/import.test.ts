import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import writeXlsxFile, { type Cell } from "write-excel-file/node";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records, by their names: other files share the app, and masters are never deleted.
const USERNAME = "importui-una";
const PASSWORD = "importui una's first password";

const HEADERS: Record<string, string[]> = {
  Materials: ["ID", "Type", "Description", "Base unit", "Active"],
  Locations: ["ID", "Name", "Active"],
  "BOM headers": ["BOM ID", "Import reference", "Output material ID", "Priority", "Valid from", "Valid through", "Active"],
  "BOM lines": ["BOM", "Component material ID", "Quantity", "Unit"],
};

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text. */
const button = (name: string) => `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
const FILE_INPUT = `document.querySelector("main input[type=file]")`;

// The Import screen (spec .ai/specs/implemented/2026-10-20--0908UTC-master-data-bom-import.md), in Prod.
describe("the Import screen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cpg-import-ui-"));
  let admin: Browser;

  /** A workbook file from sheet names and their data rows; the header rows are added. */
  async function workbook(sheets: Record<string, Cell[][]>): Promise<string> {
    const file = path.join(dir, `${randomUUID()}.xlsx`);
    writeFileSync(file, await writeXlsxFile(Object.entries(sheets).map(([sheet, rows]) => ({ sheet, data: [HEADERS[sheet], ...rows] }))).toBuffer());
    return file;
  }

  /** A table's rows as their cells' text. */
  const table = (label: string) =>
    admin.evaluate<string[][]>(
      `[...document.querySelectorAll('main table[aria-label=${JSON.stringify(label)}] tbody tr')].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
    );

  /** Opens the Import screen, chooses `file` and runs the dry run until its report shows. */
  async function dryRun(file: string) {
    await admin.open(`${baseUrl}/admin/prod/import`);
    await admin.waitUntil(ready(FILE_INPUT));
    await admin.upload("main input[type=file]", file);
    await admin.waitUntil(`${ready(button("Run dry run"))} && !${button("Run dry run")}.disabled`);
    await admin.evaluate(`(${button("Run dry run")}).click(), true`);
    await admin.waitUntil(`document.querySelector('main table[aria-label="Sheet"]') || document.querySelector("main [role=alert]")`);
  }

  /** Commits the dry run on screen, and waits for the outcome. */
  async function commit(label: string) {
    await admin.evaluate(`(${button(label)}).click(), true`);
    await admin.waitUntil(`document.querySelector("main [role=status]") || document.querySelector("main [role=alert]")`);
  }

  beforeAll(async () => {
    admin = openBrowser();
    // The sidebar shows every entry at this size, as in navigation.test.ts.
    await admin.setViewport(1280, 800);
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => admin.close());

  it("opens from the sidebar for the admin, and serves the template", async () => {
    await admin.open(`${baseUrl}/admin/prod/materials`);
    await clickHydrated(admin, "[data-slot=sidebar] [data-slot=sidebar-menu] a[href='/admin/prod/import']");
    await admin.waitForText("Import from spreadsheet — Prod");

    expect(await admin.evaluate<string>(`document.querySelector('main a[download]').getAttribute("href")`)).toBe("/api/import/template");
    expect(await admin.evaluate<number>(`fetch("/api/import/template").then((response) => response.status)`)).toBe(200);
  });

  it("lists an unknown ID and a duplicate, each with its sheet, row and column (XLS-004, XLS-005)", async () => {
    await dryRun(
      await workbook({
        Materials: [
          ["99999997", "raw", "importui unknown", "kg", null],
          ["99999996", "raw", "importui twice", "kg", null],
          ["99999996", "raw", "importui twice again", "kg", null],
        ],
      }),
    );

    expect(await table("Problem")).toEqual([
      ["Materials", "2", "ID", "Material 99999997 doesn't exist in Prod. Leave the ID blank to create a new record."],
      ["Materials", "3", "ID", "99999996 appears on rows 3, 4: keep one row for it."],
      ["Materials", "4", "ID", "99999996 appears on rows 3, 4: keep one row for it."],
    ]);
    expect(await admin.evaluate<boolean>(`${button("Commit 0 changes")}.disabled`)).toBe(true);
  });

  it("previews new records with their IDs, commits them, and shows them on their pages (XLS-002)", async () => {
    await dryRun(
      await workbook({
        Materials: [
          [null, "raw", "importui steel", "kg", null],
          [null, "intermediate", "importui panel", "each", null],
        ],
        Locations: [[null, "importui cave", null]],
      }),
    );
    const preview = await table("Changes");
    expect(preview.map(([sheet, row, action]) => [sheet, row, action])).toEqual([
      ["Materials", "2", "Create"],
      ["Materials", "3", "Create"],
      ["Locations", "2", "Create"],
    ]);
    expect(preview[0][3]).toMatch(/^\d{8} — importui steel$/);

    await commit("Commit 3 changes");
    expect(await admin.text("main [role=status]")).toBe("✓ Imported into Prod: 3 created, 0 updated, 0 unchanged.");
    await admin.open(`${baseUrl}/admin/prod/materials`);
    await admin.waitForText("importui panel");
    await admin.open(`${baseUrl}/admin/prod/locations`);
    await admin.waitForText("importui cave");
  });

  it("creates a BOM through its import reference (XLS-018)", async () => {
    const materials = await admin.evaluate<{ id: string; description: string }[]>(
      `fetch("/api/tenants/prod/materials").then((response) => response.json()).then((body) => body.data)`,
    );
    const id = (description: string) => materials.find((material) => material.description === description)!.id;

    await dryRun(
      await workbook({
        "BOM headers": [[null, "IMPORTUI-PANEL", id("importui panel"), 1, "2027-01-01", null, null]],
        "BOM lines": [["IMPORTUI-PANEL", id("importui steel"), 2.5, "kg"]],
      }),
    );
    const [header] = await table("Changes");
    expect(header[2]).toBe("Create");
    expect(header[3]).toMatch(/\(IMPORTUI-PANEL\)$/);
    await commit("Commit 1 change");

    const bom = header[3].slice(0, 8);
    await admin.open(`${baseUrl}/admin/prod/boms/${bom}`);
    await admin.waitForText("importui steel");
  });

  it("finds the same problems at the same cells through the API as on the screen (API-015)", async () => {
    const file = await workbook({ Materials: [[null, "raw", "importui parity", "kg", null], ["99999995", "raw", "importui parity unknown", "kg", null]] });
    await dryRun(file);
    const screenProblems = await table("Problem");

    await openTokens(admin, baseUrl);
    const secret = await createToken(admin, "importui-parity");
    try {
      const { readFileSync } = await import("node:fs");
      const response = await callApi(baseUrl, "POST", "/api/tenants/prod/import/dry-run", secret, {
        key: randomUUID(),
        body: { workbook: readFileSync(file).toString("base64") },
      });
      const report = json(response).data as { errors: { sheet: string; row: number; column: string }[] };
      expect(report.errors.map(({ sheet, row, column }) => [sheet, String(row), column])).toEqual(screenProblems.map(([sheet, row, column]) => [sheet, row, column]));
    } finally {
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find((token) => token.name === "importui-parity")!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    }
  });

  it("refuses the commit once the tenant turns read-only, then locks the screen, writing nothing (XLS-015)", async () => {
    await openTokens(admin, baseUrl);
    const secret = await createToken(admin, "importui-read-only");
    const tenant = (readOnly: boolean) => callApi(baseUrl, "PATCH", "/api/tenants/prod", secret, { key: randomUUID(), body: { readOnly } });
    try {
      await dryRun(await workbook({ Locations: [[null, "importui read-only", null]] }));
      expect((await table("Changes")).map(([sheet, , action]) => [sheet, action])).toEqual([["Locations", "Create"]]);
      // Prod turns read-only while the clean dry run is on screen.
      expect((await tenant(true)).status).toBe(200);
      await commit("Commit 1 change");
      expect(await admin.text("main [role=alert]")).toContain("read-only");

      await admin.open(`${baseUrl}/admin/prod/import`);
      await admin.waitForText("Prod is read-only: imports are blocked");
      expect(await admin.evaluate<boolean>(`${FILE_INPUT}.disabled`)).toBe(true);
      const locations = json(await callApi(baseUrl, "GET", "/api/tenants/prod/locations", secret)).data as { name: string }[];
      expect(locations.map(({ name }) => name)).not.toContain("importui read-only");
    } finally {
      await tenant(false);
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find((token) => token.name === "importui-read-only")!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    }
  });

  it("doesn't show a normal user the entry, and sends them away from the screen (Q12)", async () => {
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    const una = openBrowser();
    try {
      await signIn(una, baseUrl, PASSWORD, USERNAME);
      await una.waitForText(USERNAME);
      await una.open(`${baseUrl}/admin/prod/materials`);
      await una.waitForText("Materials — Prod");
      expect(await una.evaluate<number>(`document.querySelectorAll("a[href='/admin/prod/import']").length`)).toBe(0);

      await una.open(`${baseUrl}/admin/prod/import`);
      await una.waitUntil(`location.pathname === "/admin"`);
    } finally {
      await una.close();
    }
  });
});
