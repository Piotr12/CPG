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

// The Stock import screen (spec .ai/specs/implemented/2026-10-20--2225UTC-stock-import.md), used by a normal user
// and by the admin in Prod (STX-018), on this file's own materials and locations.
describe("the Stock import screen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cpg-stock-import-ui-"));
  let admin: Browser;
  let sam: Browser;
  let flint: string;
  let hide: string;
  let ore: string;
  let cave: string;

  /** A stock workbook file from its data rows; the header row is added. */
  async function workbook(rows: Cell[][]): Promise<string> {
    const file = path.join(dir, `${randomUUID()}.xlsx`);
    writeFileSync(file, await writeXlsxFile([{ sheet: "Stock", data: [HEADERS, ...rows] }]).toBuffer());
    return file;
  }

  /** A table's rows as their cells' text, in `browser`'s page. */
  const table = (label: string, browser = sam) =>
    browser.evaluate<string[][]>(
      `[...document.querySelectorAll('main table[aria-label=${JSON.stringify(label)}] tbody tr')].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
    );

  /** Opens the Stock import screen in `browser`, chooses `file` and runs the dry run until its report shows. */
  async function dryRun(file: string, browser = sam) {
    await browser.open(`${baseUrl}/admin/prod/stock-import`);
    await browser.waitUntil(ready(FILE_INPUT));
    await browser.upload("main input[type=file]", file);
    await browser.waitUntil(`${ready(button("Run dry run"))} && !${button("Run dry run")}.disabled`);
    await browser.evaluate(`(${button("Run dry run")}).click(), true`);
    await browser.waitUntil(`document.querySelector('main table[aria-label="Sheet"]') || document.querySelector("main [role=alert]")`);
  }

  /** Enters `reason` and posts the dry run's one correction in `browser`, until the result shows. */
  async function postOne(browser: Browser, reason: string) {
    await browser.fill("main input[placeholder='Opening balance']", reason);
    await browser.waitUntil(`!${button("Post 1 correction")}.disabled`);
    await browser.evaluate(`(${button("Post 1 correction")}).click(), true`);
    await browser.waitUntil(`document.querySelector("main [role=status]") || document.querySelector("main [role=alert]")`);
  }

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await openTokens(admin, baseUrl);
    const secret = await createToken(admin, "stockimportui-setup");
    const write = async (pathname: string, body: unknown) => json(await callApi(baseUrl, "POST", pathname, secret, { key: randomUUID(), body })).data;
    flint = (await write("/api/tenants/prod/materials", { type: "raw", description: "stockimportui flint", baseUnit: "each" })).id;
    hide = (await write("/api/tenants/prod/materials", { type: "raw", description: "stockimportui hide", baseUnit: "kg" })).id;
    // The admin's own material, so its commit moves none of sam's positions.
    ore = (await write("/api/tenants/prod/materials", { type: "raw", description: "stockimportui ore", baseUnit: "kg" })).id;
    cave = (await write("/api/tenants/prod/locations", { name: "stockimportui cave" })).id;
    await write("/api/tenants/prod/stock/corrections", { material: flint, location: cave, quantity: "100", unit: "each", reason: "stockimportui opening" });
    await write("/api/tenants/prod/stock/corrections", { material: hide, location: cave, quantity: "7", unit: "kg", reason: "stockimportui opening" });
    // Other files expect the admin to hold no tokens: revoke this one with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find((token) => token.name === "stockimportui-setup")!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    sam = openBrowser();
    // The sidebar shows every entry at this size, as in navigation.test.ts.
    await Promise.all([sam, admin].map((browser) => browser.setViewport(1280, 800)));
    await signInAs(sam, baseUrl, USERNAME, PASSWORD);
  });
  afterAll(() => Promise.all([sam, admin].map((browser) => browser?.close())));

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

    await postOne(sam, "stockimportui count");
    expect(await sam.text("main [role=status]")).toBe("✓ Posted to Prod. Corrections: 1, unchanged: 1. Reason: stockimportui count.");

    await sam.evaluate(`[...document.querySelectorAll("main a")].find((a) => a.textContent.startsWith(${JSON.stringify(flint)})).click(), true`);
    await sam.waitUntil(`document.querySelector("[data-stock-balance]")?.textContent === "85 each"`);
    expect(await sam.text("main table")).toContain("stockimportui count");
    expect(await sam.text("main table")).toContain(USERNAME);
  });

  it("posts the admin's import as the admin's own account and session, on the UI channel (STX-018)", async () => {
    const reason = `stockimportui admin count ${randomUUID().slice(0, 8)}`;
    await dryRun(await workbook([[ore, cave, 12, null]]), admin);
    expect(await table("Changes", admin)).toEqual([
      ["Stock", "2", "Correct", `${ore} — stockimportui ore at ${cave} — stockimportui cave`, "Physical quantity: 0.000000 kg → 12.000000 kg Movement: +12.000000 kg"],
    ]);
    await postOne(admin, reason);
    expect(await admin.text("main [role=status]")).toBe(`✓ Posted to Prod. Corrections: 1, unchanged: 0. Reason: ${reason}.`);

    // Read with each browser's own session cookie (a GET needs no token). Other files post movements in
    // Prod, so keep this file's entries by their reason and material, never by account or channel.
    type Entry = { action: string; actor: { username: string }; channel: string; sessionId: string | null; token: unknown; after: { reason?: string; material?: string } | null };
    const posted = (browser: Browser, material: string, why: string) =>
      browser
        .evaluate<Entry[]>(`fetch("/api/tenants/prod/audit?limit=100").then((response) => response.json()).then((body) => body.data.entries)`)
        .then((entries) => entries.filter((entry) => entry.action === "stock.movement.posted" && entry.after?.material === material && entry.after?.reason === why));
    const [mine] = await posted(admin, ore, reason);
    expect(mine).toMatchObject({ actor: { username: "admin" }, channel: "ui", sessionId: expect.any(String), token: null, after: { reason, material: ore } });
    // Its own session: not the normal user's, whose commit the previous test posted.
    const [sams] = await posted(sam, flint, "stockimportui count");
    expect(sams).toMatchObject({ actor: { username: USERNAME }, channel: "ui", sessionId: expect.any(String) });
    expect(mine.sessionId).not.toBe(sams.sessionId);
  });
});
