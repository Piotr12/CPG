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
/** The page's button with exactly this text or accessible name, if any. */
const button = (name: string) =>
  `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)} || b.getAttribute("aria-label") === ${JSON.stringify(name)})`;
const closed = `!document.querySelector("[role=dialog]")`;

/** A page's table rows as their cells' text, once its first table is shown. */
async function rows(browser: Browser, path: string): Promise<string[][]> {
  await browser.open(`${baseUrl}${path}`);
  await browser.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
  return browser.evaluate<string[][]>(
    `[...document.querySelectorAll("main table tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
  );
}

// E09-S01: the purchasing screens in a real browser. The Test tenant is seeded with the tiny generated
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

  it("lists the dataset's orders, and opens the open one that converts a requisition, with its dated lines", async () => {
    // The tiny dataset's orders fit one page; paging them is test-reset-realistic.test.ts's.
    const first = await rows(una, "/admin/test/purchase-orders");
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(100);
    expect(first[0][0]).toBe("00000001");
    expect(first[0].at(-1)).toBe("Completed");

    // Next month's order of 2 mm sheet for Wrocław converts requisition 00000001: it is one of that pair's open
    // orders, among the latest, so look from the last.
    let converting: string[] | undefined;
    const candidates = first
      .filter((row) => row[1] === "00000001 Steel Service Centre Sp. z o.o." && row[2] === "00000001 Main plant, Wrocław" && row.at(-1) === "Open")
      .map(([id]) => id)
      .reverse();
    for (const id of candidates) {
      converting = (await rows(una, `/admin/test/purchase-orders/${id}`)).find((line) => line[5] === "00000001");
      if (converting) break;
    }
    expect(converting!.slice(0, 2)).toEqual(["1", "00000001 Steel sheet 2 mm"]);
    expect(converting![4]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("lets a normal user create a requisition in Prod, which then appears Open and unconverted", async () => {
    await createMaster(admin, "materials", "buy steel", { type: "raw", baseUnit: "kg" });
    await createMaster(admin, "locations", "buy plant");

    const mine = await createRequisition(una, "buy steel", "buy plant", "100");

    expect(mine[0]).toMatch(/^\d{8}$/);
    expect(mine.join(" ")).toContain("Open");
    expect(mine.join(" ")).toContain("100");
  });

  it("lets a normal user create a PO directly and by converting a requisition in the Create purchase order dialog; both open with their lines", async () => {
    await createMaster(admin, "materials", "buypo steel", { type: "raw", baseUnit: "kg" });
    await createMaster(admin, "locations", "buypo plant");
    await createMaster(admin, "suppliers", "buypo acme");
    const [requisition] = await createRequisition(una, "buypo steel", "buypo plant", "100");

    await una.setViewport(1280, 800);
    await createOrder(una, { material: "buypo steel", quantity: "20", plannedDate: "2027-03-03" });
    await createOrder(una, { material: "buypo steel", quantity: "60", plannedDate: "2027-03-04", requisition });

    const placed = await ordersOf(una, "buypo acme");
    expect(placed.map((row) => [row[2], row.at(-1)])).toEqual([
      [expect.stringContaining("buypo plant"), "Open"],
      [expect.stringContaining("buypo plant"), "Open"],
    ]);
    const direct = await orderLines(una, placed[0][0]);
    const converting = await orderLines(una, placed[1][0]);
    expect(direct).toHaveLength(1);
    expect(direct[0].slice(0, 2)).toEqual(["1", expect.stringContaining("buypo steel")]);
    expect([direct[0][4], direct[0][5]]).toEqual(["2027-03-03", "—"]);
    expect(converting).toHaveLength(1);
    expect([converting[0][1], converting[0][4], converting[0][5]]).toEqual([expect.stringContaining("buypo steel"), "2027-03-04", requisition]);
    // The requisition counts what the order converted.
    const converted = await requisitionRow(una, ([id]) => id === requisition);
    expect(converted.slice(3, 6)).toEqual(["100 kg", "60 kg", "40 kg"]);
  });

  // Uses the orders and the location the test above creates.
  it("refuses the admin's deactivation of a location an Open PO delivers to, linking the order, and keeps it Active (LFC-018)", async () => {
    const [order] = (await ordersOf(admin, "buypo acme"))[0];
    const [location] = (await rows(admin, "/admin/prod/locations")).find((row) => row[1] === "buypo plant")!;

    await admin.waitUntil(ready(button(`Actions for ${location}`)));
    await admin.clickRole("button", `Actions for ${location}`);
    await admin.clickRole("menuitem", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!!document.querySelector("[role=alertdialog] [role=alert]")`);

    expect(
      await admin.evaluate<{ text: string; href: string | null }>(`(() => {
        const alert = document.querySelector("[role=alertdialog] [role=alert]");
        return { text: alert.innerText.trim(), href: alert.querySelector("a")?.getAttribute("href") ?? null };
      })()`),
    ).toEqual({ text: `Purchase order ${order} is still Open for delivery to this location. ${order}`, href: `/admin/prod/purchase-orders/${order}` });
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);
    expect((await rows(admin, "/admin/prod/locations")).find(([id]) => id === location)?.[2]).toBe("Active");
  });

  // Uses the orders the Create purchase order test above creates: both have a line for buypo steel, so the lower one is named.
  it("refuses the admin's deactivation of a material an Open PO line uses, linking the order, which the link opens (LFC-013, #186)", async () => {
    const [order] = (await ordersOf(admin, "buypo acme"))[0];
    const [material] = (await orderLines(admin, order))[0][1].split(" ");
    const alert = "[role=alertdialog] [role=alert]";

    await admin.open(`${baseUrl}/admin/prod/materials/${material}`);
    await admin.waitUntil(ready(button("Deactivate")));
    await admin.clickRole("button", "Deactivate");
    await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil(`!!document.querySelector("${alert}")`);

    expect(
      await admin.evaluate<{ text: string; href: string | null }>(`(() => {
        const alert = document.querySelector("${alert}");
        return { text: alert.innerText.trim(), href: alert.querySelector("a")?.getAttribute("href") ?? null };
      })()`),
    ).toEqual({ text: `Purchase order ${order} has an open line for this material, so it can't be deactivated. ${order}`, href: `/admin/prod/purchase-orders/${order}` });
    await admin.click(`${alert} a`);
    await admin.waitUntil(
      `location.pathname === "/admin/prod/purchase-orders/${order}" && [...document.querySelectorAll("main h1")].some((h) => h.offsetParent && h.textContent.startsWith("Purchase order ${order} "))`,
    );
    await admin.open(`${baseUrl}/admin/prod/materials/${material}`);
    await admin.waitUntil(ready(button("Deactivate")));
    expect(await admin.texts("main dd")).toContain("Active");
  });

  it("lets a normal user change an Open requisition's required date on screen, which the audit records (#142)", async () => {
    // At 1280 × 800 the Required column shows and the row's actions sit inside the table, unscrolled.
    await una.setViewport(1280, 800);
    const [id] = await requisitionRow(una, (row) => row.join(" ").includes("buy steel"));
    const label = `Change date — Purchase requisitions ${id}`;
    const trigger = `document.querySelector(${JSON.stringify(`main button[aria-label="${label}"]`)})`;
    await una.waitUntil(ready(trigger));
    expect(await una.evaluate<boolean>(`(() => {
      const box = ${trigger}.getBoundingClientRect();
      const table = ${trigger}.closest("[data-slot=table-container]");
      return box.right <= innerWidth && table.scrollWidth <= table.clientWidth;
    })()`)).toBe(true);

    await una.clickRole("button", label);
    await una.waitFor("[role=dialog]");
    expect(await una.text("[role=dialog] h2")).toBe(`Change required date — Purchase requisitions ${id}`);
    expect(await una.fillDate("[role=dialog] [name=requiredDate]", "2027-04-15")).toBe("2027-04-15");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    const mine = await requisitionRow(una, (row) => row[0] === id);
    expect(mine[6]).toBe("2027-04-15");
    expect(mine[7]).toBe("Open");

    await una.open(`${baseUrl}/admin/prod/audit?subjectType=PurchaseRequisition&subjectId=${id}`);
    await una.waitUntil(`document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")`);
    const entries = await una.evaluate<string[]>(
      `[...document.querySelectorAll("main tbody tr")].filter((row) => !row.closest("[hidden]")).map((row) => row.innerText.replace(/\\s+/g, " "))`,
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain("Purchase requisition changed");
    expect(entries[0]).toContain(USERNAME);
    expect(entries[0]).toContain("2027-03-01 → 2027-04-15");

    // At phone width the page itself never scrolls sideways: the row's actions are reached in the table's own
    // scroll, inside the table's box and the window, and still open the dialog.
    try {
      await una.setViewport(390, 844);
      await requisitionRow(una, (row) => row[0] === id);
      await una.waitUntil(ready(trigger));
      expect(await una.evaluate<boolean>(`(${trigger}.scrollIntoView({ block: "center", inline: "center" }), true)`)).toBe(true);
      expect(await una.evaluate<boolean>(`(() => {
        const box = ${trigger}.getBoundingClientRect();
        const table = ${trigger}.closest("[data-slot=table-container]").getBoundingClientRect();
        return document.documentElement.scrollWidth <= innerWidth && box.left >= table.left && box.right <= table.right && box.right <= innerWidth;
      })()`)).toBe(true);
      await una.clickRole("button", label);
      await una.waitFor("[role=dialog]");
      expect(await una.text("[role=dialog] h2")).toBe(`Change required date — Purchase requisitions ${id}`);
      await una.clickRole("button", "Cancel");
      await una.waitUntil(`${closed} && !document.querySelector("[data-slot=dialog-overlay]")`);
    } finally {
      await una.setViewport(1280, 800);
    }
  });
});

/** Creates a Prod requisition through the Create requisition dialog; its row in the list. */
async function createRequisition(browser: Browser, material: string, location: string, quantity: string): Promise<string[]> {
  await browser.open(`${baseUrl}/admin/prod/purchase-requisitions`);
  await browser.waitUntil(ready(button("Create requisition")));
  await browser.clickRole("button", "Create requisition");
  await browser.waitFor("[role=dialog]");
  await browser.select("[role=dialog] select[name=material]", await optionFor(browser, material));
  await browser.select("[role=dialog] select[name=location]", await optionFor(browser, location));
  await browser.fill("[role=dialog] [name=quantity]", quantity);
  expect(await browser.fillDate("[role=dialog] [name=requiredDate]", "2027-03-01")).toBe("2027-03-01");
  await browser.click("[role=dialog] button[type=submit]");
  await browser.waitUntil(closed);
  // Other files create Prod requisitions too: the one made here is the one for `material`.
  return requisitionRow(browser, (row) => row[1].includes(material));
}

/**
 * The first Prod requisition row `match` finds, from the list's last page back (the newest are last;
 * other files leave Prod with more than a page), leaving the browser on that row's page.
 */
async function requisitionRow(browser: Browser, match: (row: string[]) => boolean): Promise<string[]> {
  // A page past the last shows the last; 1,000,000 is the highest page the list takes.
  let found = (await rows(browser, "/admin/prod/purchase-requisitions?page=1000000")).find(match);
  const label = await browser.evaluate<string>(`document.querySelector('main nav[aria-label="Purchase requisition pages"] span')?.textContent ?? "Page 1 of 1"`);
  for (let page = Number(/of (\d+)$/.exec(label)![1]) - 1; !found && page >= 1; page -= 1) {
    found = (await rows(browser, `/admin/prod/purchase-requisitions?page=${page}`)).find(match);
  }
  return found!;
}

/** Creates a one-line Prod order from "buypo acme" to "buypo plant" through the Create purchase order dialog. */
async function createOrder(browser: Browser, line: { material: string; quantity: string; plannedDate: string; requisition?: string }) {
  await browser.open(`${baseUrl}/admin/prod/purchase-orders`);
  await browser.waitUntil(ready(button("Create purchase order")));
  await browser.clickRole("button", "Create purchase order");
  await browser.waitFor("[role=dialog]");
  await browser.select("[role=dialog] select[name=supplier]", await optionFor(browser, "buypo acme"));
  await browser.select("[role=dialog] select[name=location]", await optionFor(browser, "buypo plant"));
  await browser.select(`[role=dialog] select[name="lines.0.material"]`, await optionFor(browser, line.material));
  await browser.fill(`[role=dialog] [name="lines.0.quantity"]`, line.quantity);
  expect(await browser.fillDate(`[role=dialog] [name="lines.0.plannedDate"]`, line.plannedDate)).toBe(line.plannedDate);
  if (line.requisition) await browser.select(`[role=dialog] select[name="lines.0.requisition"]`, line.requisition);
  await browser.click("[role=dialog] button[type=submit]");
  await browser.waitUntil(closed);
}

/** A Prod order's lines as their cells' text: the page's first table (its receipts follow). */
async function orderLines(browser: Browser, id: string): Promise<string[][]> {
  await rows(browser, `/admin/prod/purchase-orders/${id}`);
  return browser.evaluate<string[][]>(
    `[...document.querySelector("main table").querySelectorAll(":scope tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`,
  );
}

/** The Prod order rows of `supplier`, by ID. They are the newest, so on the list's last page or the one before. */
async function ordersOf(browser: Browser, supplier: string): Promise<string[][]> {
  await rows(browser, "/admin/prod/purchase-orders");
  const label = await browser.evaluate<string>(`document.querySelector('main nav[aria-label="Purchase order pages"] span')?.textContent ?? "Page 1 of 1"`);
  const pages = Number(/of (\d+)$/.exec(label)![1]);
  const found: string[][] = [];
  for (const page of [pages - 1, pages].filter((each) => each >= 1)) {
    found.push(...(await rows(browser, `/admin/prod/purchase-orders?page=${page}`)).filter((row) => row[1].includes(supplier)));
  }
  return found;
}

/** The value of the select option whose label contains `text`, in the open dialog's first matching select. */
async function optionFor(browser: Browser, text: string): Promise<string> {
  return browser.evaluate<string>(
    `[...document.querySelectorAll("[role=dialog] option")].find((o) => o.textContent.includes(${JSON.stringify(text)})).value`,
  );
}

/** Creates a Prod master through its screen's own dialog. */
async function createMaster(admin: Browser, kind: "materials" | "locations" | "suppliers", name: string, extra: { type?: string; baseUnit?: string } = {}) {
  const create = { materials: "Create material", locations: "Create location", suppliers: "Create supplier" }[kind];
  await admin.open(`${baseUrl}/admin/prod/${kind}`);
  await admin.waitUntil(ready(button(create)));
  await admin.clickRole("button", create);
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
