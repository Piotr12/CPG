import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account: users are never deleted. Any signed-in account may create purchasing documents.
const USERNAME = "buy-una";
const PASSWORD = "buy una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
const closed = `!document.querySelector("[role=dialog]")`;

/** A page's table rows as their cells' text, once its first table is shown. */
async function rows(browser: Browser, path: string): Promise<string[][]> {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main table tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
  );
}

// E09-S01: the purchasing screens in a real browser. The Test tenant is seeded with the generated
// dataset's requisitions and orders (D06); a normal user creates a requisition in Prod, in the UI.
describe("purchase requisitions and orders in the UI", () => {
  let admin: Browser;
  let una: Browser;

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitUntil(signedInAndHydrated(USERNAME));
  });
  afterAll(async () => {
    await Promise.all([admin, una].map((browser) => browser.close()));
  });

  it("lists the dataset's requisitions, with what is converted and what is outstanding", async () => {
    const table = (await rows(una, "/admin/test/purchase-requisitions")).map((row) => row.slice(0, 8));

    expect(table).toHaveLength(5);
    // Two are converted in full by next month's orders; the quantity follows the supply plan, so only its shape is fixed.
    expect(table[0].slice(0, 3)).toEqual(["00000001", "00000001 Steel sheet 2 mm", "00000001 Main plant, Wrocław"]);
    expect(table[0][4]).toBe(table[0][3]);
    expect(table[0].slice(5)).toEqual(["0 kg", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "Completed"]);
    expect(table[1].slice(0, 3)).toEqual(["00000002", "00000009 Powder coat, grey RAL 7035", "00000002 Lockers plant, Poznań"]);
    expect(table[1][7]).toBe("Completed");
    // Three are open, with nothing converted yet.
    expect(table.slice(2).map((row) => [row[0], row[1], row[2], row[3], row[4], row[5], row[7]])).toEqual([
      ["00000003", "00000007 Steel sheet 1.0 mm", "00000004 Small goods plant, Gdańsk", "1000 kg", "0 kg", "1000 kg", "Open"],
      ["00000004", "00000013 Galvanised steel sheet 0.8 mm", "00000003 Sheet-metal plant, Łódź", "500 kg", "0 kg", "500 kg", "Open"],
      ["00000005", "00000014 Welding wire 0.8 mm", "00000002 Lockers plant, Poznań", "30 kg", "0 kg", "30 kg", "Open"],
    ]);
  });

  it("pages the dataset's orders by 100, and opens the open one that converts a requisition, with its dated lines", async () => {
    const first = await rows(una, "/admin/test/purchase-orders");
    expect(first).toHaveLength(100);
    expect(first[0][0]).toBe("00000001");
    expect(first[0].at(-1)).toBe("Completed");
    // Page 1 shows "Page 1 of N" with a Next link only.
    const nav = `document.querySelector('main nav[aria-label="Purchase order pages"]')`;
    await una.waitUntil(`${nav} && !${nav}.closest("[hidden]")`);
    const label = await una.evaluate<string>(`${nav}.querySelector("span").textContent`);
    const pages = Number(/^Page 1 of (\d+)$/.exec(label)![1]);
    expect(pages).toBeGreaterThan(1);
    expect(await una.evaluate<string[]>(`[...${nav}.querySelectorAll("a")].map((a) => a.textContent.trim())`)).toEqual(["Next"]);

    const second = await rows(una, "/admin/test/purchase-orders?page=2");
    expect(second[0][0]).toBe(String(Number(first[99][0]) + 1).padStart(8, "0"));

    // Next month's order of 2 mm sheet for Wrocław converts requisition 00000001: it is one of that pair's open
    // orders, among the latest, so walk the pages from the last.
    let converting: string[] | undefined;
    for (let page = pages; page >= 1 && !converting; page--) {
      const table = await rows(una, `/admin/test/purchase-orders?page=${page}`);
      const candidates = table
        .filter((row) => row[1] === "00000001 Steel Service Centre Sp. z o.o." && row[2] === "00000001 Main plant, Wrocław" && row.at(-1) === "Open")
        .map(([id]) => id)
        .reverse();
      for (const id of candidates) {
        converting = (await rows(una, `/admin/test/purchase-orders/${id}`)).find((line) => line[5] === "00000001");
        if (converting) break;
      }
    }
    expect(converting!.slice(0, 2)).toEqual(["1", "00000001 Steel sheet 2 mm"]);
    expect(converting![4]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("lets a normal user create a requisition in Prod, which then appears Open and unconverted", async () => {
    await createMaster(admin, "materials", "buy steel", { type: "raw", baseUnit: "kg" });
    await createMaster(admin, "locations", "buy plant");
    await una.open(`${baseUrl}/admin/prod/purchase-requisitions`);

    await una.waitUntil(ready(button("Create requisition")));
    await una.clickRole("button", "Create requisition");
    await una.waitFor("[role=dialog]");
    await una.select("[role=dialog] select[name=material]", await optionFor(una, "buy steel"));
    await una.select("[role=dialog] select[name=location]", await optionFor(una, "buy plant"));
    await una.fill("[role=dialog] [name=quantity]", "100");
    expect(await una.fillDate("[role=dialog] [name=requiredDate]", "2027-03-01")).toBe("2027-03-01");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    const table = await rows(una, "/admin/prod/purchase-requisitions");
    // Other files create Prod requisitions too: the one made here is the "buy steel" one.
    const mine = table.find((row) => row.join(" ").includes("buy steel"));
    expect(mine![0]).toMatch(/^\d{8}$/);
    expect(mine!.join(" ")).toContain("Open");
    expect(mine!.join(" ")).toContain("100");
  });
});

/** The value of the select option whose label contains `text`, in the open dialog's first matching select. */
async function optionFor(browser: Browser, text: string): Promise<string> {
  return browser.evaluate<string>(
    `[...document.querySelectorAll("[role=dialog] option")].find((o) => o.textContent.includes(${JSON.stringify(text)})).value`,
  );
}

/** Creates a Prod master through its screen's own dialog. */
async function createMaster(admin: Browser, kind: "materials" | "locations", name: string, extra: { type?: string; baseUnit?: string } = {}) {
  await admin.open(`${baseUrl}/admin/prod/${kind}`);
  await admin.waitUntil(ready(button(kind === "materials" ? "Create material" : "Create location")));
  await admin.clickRole("button", kind === "materials" ? "Create material" : "Create location");
  await admin.waitFor("[role=dialog]");
  if (kind === "materials") {
    await admin.select("[role=dialog] select[name=type]", extra.type!);
    await admin.fillLabel("Description", name);
    await admin.fillLabel("Base unit", extra.baseUnit!);
  } else {
    await admin.fillLabel("Name", name);
  }
  await admin.click("[role=dialog] button[type=submit]");
  await admin.waitUntil(closed);
  await admin.waitForText(name);
}
