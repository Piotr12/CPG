import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signIn, signInAsAdmin } from "./sign-in";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own records: other files share the app, and nothing here is ever deleted.
const USERNAME = "mat-una";
const PASSWORD = "mat una's first password";
const BOLT = "mat-ui bolt";
const NUT = "mat-ui nut";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
/** The page's button with exactly this text, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;

/** The list's rows as `[ID, description, type, base unit, status]`. */
async function listRows(browser: Browser, tenant: string): Promise<string[][]> {
  await browser.open(`${baseUrl}/admin/${tenant}/materials`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
  );
}

/** Creates a material in Prod through the dialog and returns its new ID, read from the list. */
async function createInProd(admin: Browser, type: string, description: string, baseUnit: string): Promise<string> {
  const before = new Set((await listRows(admin, "prod")).map(([id]) => id));
  await admin.waitUntil(ready(button("Create material")));
  await admin.clickRole("button", "Create material");
  await admin.select("[role=dialog] select[name=type]", type);
  await admin.fillLabel("Description", description);
  await admin.fillLabel("Base unit", baseUnit);
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  await admin.waitForText(description);
  // The new row is the one that wasn't there: other files create Prod materials too.
  return (await listRows(admin, "prod")).find(([id, text]) => !before.has(id) && text === description)![0];
}

/** Opens a Prod material's page and waits until its controls can be used. */
async function openMaterial(browser: Browser, id: string, controls: boolean) {
  await browser.open(`${baseUrl}/admin/prod/materials/${id}`);
  await browser.waitUntil(`document.querySelector("main h1") && !document.querySelector("main h1").closest("[hidden]")`);
  if (controls) await browser.waitUntil(ready(button("Add conversion")));
}

describe("materials and their unit conversions (E03-S01)", () => {
  let admin: Browser;
  let una: Browser;
  let boltId: string;

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
  });
  afterAll(() => Promise.all([admin, una].map((browser) => browser.close())));

  it("starts Test with demonstration materials, reached from the tenant home (TEN-001, D06)", async () => {
    await admin.open(`${baseUrl}/admin/test`);
    await admin.waitUntil(ready(`document.querySelector("main a[href='/admin/test/materials']")`));
    await admin.click("main a[href='/admin/test/materials']");
    await admin.waitForText("Materials — Test");

    const rows = await listRows(admin, "test");
    expect(await admin.title()).toBe("Test · Materials");
    expect(rows.slice(0, 3)).toEqual([
      ["00000001", "Steel sheet 2 mm", "Raw", "kg", "Active"],
      ["00000002", "Bolt M8", "Raw", "each", "Active"],
      ["00000003", "Paint, red", "Raw", "l", "Active"],
    ]);
  });

  it("gives materials created in Prod consecutive IDs, independent of Test (MAT-001, MAT-002, MAT-003)", async () => {
    const testBefore = await listRows(admin, "test");

    boltId = await createInProd(admin, "raw", BOLT, "each");
    const nutId = await createInProd(admin, "intermediate", NUT, "each");

    expect(boltId).toMatch(/^\d{8}$/);
    expect(nutId).toBe(String(Number(boltId) + 1).padStart(8, "0"));
    expect((await listRows(admin, "prod")).find((cells) => cells[0] === nutId)).toEqual([nutId, NUT, "Intermediate", "each", "Active"]);
    expect(await listRows(admin, "test")).toEqual(testBefore);
  });

  it("names a missing description before creating anything (MAT-008)", async () => {
    await listRows(admin, "prod");
    await admin.waitUntil(ready(button("Create material")));
    await admin.clickRole("button", "Create material");
    await admin.select("[role=dialog] select[name=type]", "raw");
    await admin.fillLabel("Base unit", "kg");
    await admin.click("[role=dialog] button[type=submit]");

    await admin.waitForText("Enter a description.");
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
  });

  it("adds 1 case = 12 each with its inverse, and refuses a zero factor (MAT-019, MAT-021, MAT-022)", async () => {
    await openMaterial(admin, boltId, true);
    expect(await admin.text("main h1")).toBe(`${boltId} — ${BOLT}`);

    await admin.clickRole("button", "Add conversion");
    await admin.fillLabel("Unit", "case");
    await admin.fillLabel("Alternate quantity", "0");
    await admin.fillLabel("Base quantity", "12");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitForText("Enter a number greater than 0, with at most 12 digits before the point and 6 after it.");

    await admin.fillLabel("Alternate quantity", "1");
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText("1 case = 12 each");

    expect(await admin.texts("main section tbody tr")).toEqual([expect.stringMatching(/^case\s+1 case = 12 each\s+1 each = 0\.083333 case/)]);
  });

  it("records an edit and a deactivation, with before and after, in the Prod audit (AUD-002, AUD-003)", async () => {
    await openMaterial(admin, boltId, true);
    await admin.clickRole("button", "Edit");
    await admin.fillLabel("Description", `${BOLT} 40`);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await admin.waitForText(`${boltId} — ${BOLT} 40`);

    await admin.waitUntil(ready(button("Deactivate")));
    await admin.clickRole("button", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive]");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    await admin.waitUntil(ready(button("Reactivate")));
    expect(await admin.texts("main dd")).toContain("Inactive");

    await admin.open(`${baseUrl}/admin/prod/audit`);
    await admin.waitFor("table");
    const rows = await admin.evaluate<string[][]>(
      `[...document.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim()))`,
    );
    const own = rows.filter((cells) => cells[5].startsWith(boltId)).map(([, account, , channel, action, , changes]) => [account, channel, action, changes]);
    expect(own).toEqual(
      expect.arrayContaining([
        ["admin", "UI", "Material deactivated", "active: yes → no"],
        ["admin", "UI", "Material changed", `description: ${BOLT} → ${BOLT} 40`],
        ["admin", "UI", "Material created", `ID: ${boltId}\ntype: raw\ndescription: ${BOLT}\nbase unit: each\nactive: yes`],
      ]),
    );
  });

  it("shows a normal user materials and conversions without any control (TEN-004)", async () => {
    await admin.open(`${baseUrl}/admin/users`);
    await admin.waitFor("table");
    await admin.waitUntil(ready(button("Create user")));
    await admin.clickRole("button", "Create user");
    await admin.fillLabel("Username", USERNAME);
    await admin.fillLabel("Initial password", PASSWORD);
    await admin.click("[role=dialog] button[type=submit]");
    await admin.waitUntil(`!document.querySelector("[role=dialog]")`);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitForText(USERNAME);

    const rows = await listRows(una, "prod");
    expect(rows.find((cells) => cells[0] === boltId)?.[1]).toBe(`${BOLT} 40`);
    expect(await una.evaluate<number>(`document.querySelectorAll("main button").length`)).toBe(0);

    await openMaterial(una, boltId, false);
    await una.waitForText("1 case = 12 each");
    expect(await una.evaluate<number>(`document.querySelectorAll("main button").length`)).toBe(0);
  });
});
