import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import writeXlsxFile, { type Cell } from "write-excel-file/node";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { clickHydrated, openBrowser, type Browser } from "./browser";
import { signInAs, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records, by their names: other files share the app, and masters are never deleted.
const USERNAME = "stockimportui-sam";
const PASSWORD = "stockimportui sam's first password";
const HEADERS = ["Material ID", "Location ID", "Physical quantity", "Unit"];

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button whose text starts with `name`. */
const button = (name: string) => `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(name)}))`;
const FILE_INPUT = `document.querySelector("main input[type=file]")`;

// The Stock import screen (spec .ai/specs/2026-10-20--2225UTC-stock-import.md), used by a normal user
// in Prod (STX-018), on this file's own materials and locations.
describe("the Stock import screen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cpg-stock-import-ui-"));
  let sam: Browser;
  let flint: string;
  let hide: string;
  let cave: string;

  /** A stock workbook file from its data rows; the header row is added. */
  async function workbook(rows: Cell[][]): Promise<string> {
    const file = path.join(dir, `${randomUUID()}.xlsx`);
    writeFileSync(file, await writeXlsxFile([{ sheet: "Stock", data: [HEADERS, ...rows] }]).toBuffer());
    return file;
  }

  /** A table's rows as their cells' text. */
  const table = (label: string) =>
    sam.evaluate<string[][]>(
      `[...document.querySelectorAll('main table[aria-label=${JSON.stringify(label)}] tbody tr')].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
    );

  /** Opens the Stock import screen, chooses `file` and runs the dry run until its report shows. */
  async function dryRun(file: string) {
    await sam.open(`${baseUrl}/admin/prod/stock-import`);
    await sam.waitUntil(ready(FILE_INPUT));
    await sam.upload("main input[type=file]", file);
    await sam.waitUntil(`${ready(button("Run dry run"))} && !${button("Run dry run")}.disabled`);
    await sam.evaluate(`(${button("Run dry run")}).click(), true`);
    await sam.waitUntil(`document.querySelector('main table[aria-label="Sheet"]') || document.querySelector("main [role=alert]")`);
  }

  beforeAll(async () => {
    const admin = openBrowser();
    try {
      await signInAsAdmin(admin, baseUrl, adminPassword);
      await createUser(admin, baseUrl, USERNAME, PASSWORD);
      await openTokens(admin, baseUrl);
      const secret = await createToken(admin, "stockimportui-setup");
      const write = async (pathname: string, body: unknown) => json(await callApi(baseUrl, "POST", pathname, secret, { key: randomUUID(), body })).data;
      flint = (await write("/api/tenants/prod/materials", { type: "raw", description: "stockimportui flint", baseUnit: "each" })).id;
      hide = (await write("/api/tenants/prod/materials", { type: "raw", description: "stockimportui hide", baseUnit: "kg" })).id;
      cave = (await write("/api/tenants/prod/locations", { name: "stockimportui cave" })).id;
      await write("/api/tenants/prod/stock/corrections", { material: flint, location: cave, quantity: "100", unit: "each", reason: "stockimportui opening" });
      await write("/api/tenants/prod/stock/corrections", { material: hide, location: cave, quantity: "7", unit: "kg", reason: "stockimportui opening" });
      // Other files expect the admin to hold no tokens: revoke this one with itself.
      const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find((token) => token.name === "stockimportui-setup")!;
      await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    } finally {
      await admin.close();
    }
    sam = openBrowser();
    // The sidebar shows every entry at this size, as in navigation.test.ts.
    await sam.setViewport(1280, 800);
    await signInAs(sam, baseUrl, USERNAME, PASSWORD);
  });
  afterAll(() => sam.close());

  it("opens from the sidebar for a normal user, and serves the stock template (STX-001)", async () => {
    await sam.open(`${baseUrl}/admin/prod/stock?material=${flint}&location=${cave}`);
    await sam.waitForText("Stock — Prod");
    expect(await sam.evaluate<string>(`document.querySelector("main a[href='/admin/prod/stock-import']").textContent`)).toBe("Import from spreadsheet");
    await clickHydrated(sam, "[data-slot=sidebar] [data-slot=sidebar-menu] a[href='/admin/prod/stock-import']");
    await sam.waitForText("Stock import — Prod");

    expect(await sam.evaluate<string>(`document.querySelector('main a[download]').getAttribute("href")`)).toBe("/api/stock-import/template");
    expect(await sam.evaluate<number>(`fetch("/api/stock-import/template").then((response) => response.status)`)).toBe(200);
  });

  it("lists a negative quantity and a position listed twice, with their rows and columns (STX-010, STX-013)", async () => {
    await dryRun(await workbook([[flint, cave, -1, null], [hide, cave, 5, null], [hide, cave, 6, "kg"]]));

    expect(await table("Problem")).toEqual([
      ["Stock", "2", "Physical quantity", "Enter a number of at least 0, with at most 12 digits before the point and 6 after it."],
      ["Stock", "3", "Location ID", `The position ${hide}/${cave} appears on rows 3, 4: keep one row per material and location.`],
      ["Stock", "4", "Location ID", `The position ${hide}/${cave} appears on rows 3, 4: keep one row per material and location.`],
    ]);
    expect(await sam.evaluate<boolean>(`${button("Post")}.disabled`)).toBe(true);
  });

  it("previews each movement, posts them with a reason, and the Stock page shows the counted balance (STX-003, STX-005, STX-021)", async () => {
    await dryRun(await workbook([[flint, cave, 85, null], [hide, cave, 7, null]]));
    const preview = await table("Changes");
    expect(preview).toEqual([
      ["Stock", "2", "Correct", `${flint} — stockimportui flint at ${cave} — stockimportui cave`, "Physical quantity: 100.000000 each → 85.000000 each Movement: -15.000000 each"],
    ]);
    expect(await sam.evaluate<boolean>(`${button("Post 1 correction")}.disabled`)).toBe(true);

    await sam.fill("main input[placeholder='Opening balance']", "stockimportui count");
    await sam.waitUntil(`!${button("Post 1 correction")}.disabled`);
    await sam.evaluate(`(${button("Post 1 correction")}).click(), true`);
    await sam.waitUntil(`document.querySelector("main [role=status]") || document.querySelector("main [role=alert]")`);
    expect(await sam.text("main [role=status]")).toBe("✓ Posted to Prod. Corrections: 1, unchanged: 1. Reason: stockimportui count.");

    await sam.evaluate(`[...document.querySelectorAll("main a")].find((a) => a.textContent.startsWith(${JSON.stringify(flint)})).click(), true`);
    await sam.waitUntil(`document.querySelector("[data-stock-balance]")?.textContent === "85 each"`);
    expect(await sam.text("main table")).toContain("stockimportui count");
    expect(await sam.text("main table")).toContain(USERNAME);
  });
});
