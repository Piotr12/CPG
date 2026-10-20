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

// E09-S01: the purchasing screens in a real browser. The Test tenant is seeded with a demonstration
// requisition and order (D06); a normal user creates a requisition in Prod, in the UI.
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

  it("lists the demonstration requisitions, with what is converted and what is outstanding", async () => {
    const table = await rows(una, "/admin/test/purchase-requisitions");

    expect(table[0][0]).toBe("00000001");
    expect(table[0].join(" ")).toContain("Open");
    expect(table[0].join(" ")).toContain("60");
    expect(table).toHaveLength(2);
  });

  it("lists the demonstration order and opens it with its dated lines and the requisition it converts", async () => {
    const table = await rows(una, "/admin/test/purchase-orders");
    expect(table[0][0]).toBe("00000001");

    await una.open(`${baseUrl}/admin/test/purchase-orders/00000001`);
    await una.waitForText("2026-11-04");
    await una.waitForText("2026-11-06");
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
