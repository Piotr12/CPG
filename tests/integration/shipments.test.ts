import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { CustomerOrderView, StockView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account: users are never deleted. Both roles ship and post goods issues.
const USERNAME = "sh-una";
const PASSWORD = "sh una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
const button = (name: string) => `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
const closed = `!document.querySelector("[role=dialog]") && !document.querySelector("[data-slot=dialog-overlay]")`;

/** The rows of the shown table named `name`, as their cells' text. */
const tableRows = (browser: Browser, name: string) =>
  browser.evaluate<string[][]>(`(() => {
    const table = [...document.querySelectorAll("main table")].find((t) => t.getAttribute("aria-label") === ${JSON.stringify(name)} && !t.closest("[hidden]"));
    return [...table.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")));
  })()`);

// E08-S02: a normal user ships against a customer order and posts goods issues, in a real browser.
describe("shipments and goods issues in the UI", () => {
  let admin: Browser;
  let una: Browser;
  let secret: string;
  const ids: Record<"widget" | "gadget" | "plant" | "retail" | "order" | "shipment", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => json(await api("POST", path, body)).data.id as string;
  const lineLabel = (field: string, line: number, material: string, description: string) => `${field}, Line ${line}: ${material} ${description}`;
  const order = async () => json(await api("GET", `/api/tenants/prod/customer-orders/${ids.order}`)).data as CustomerOrderView;

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, "sh-ui-setup");
    ids.widget = await create("/api/tenants/prod/materials", { type: "finished", description: "sh widget", baseUnit: "each" });
    ids.gadget = await create("/api/tenants/prod/materials", { type: "finished", description: "sh gadget", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "sh plant" });
    ids.retail = await create("/api/tenants/prod/customers", { name: "sh retail" });
    for (const material of [ids.widget, ids.gadget]) {
      await api("POST", "/api/tenants/prod/stock/corrections", { material, location: ids.plant, quantity: "100", unit: "each", reason: "Count" });
    }
    ids.order = await create("/api/tenants/prod/customer-orders", {
      customer: ids.retail,
      location: ids.plant,
      lines: [
        { material: ids.widget, quantity: "50", unit: "each", requiredDate: "2026-11-04" },
        { material: ids.gadget, quantity: "30", unit: "each", requiredDate: "2026-11-08" },
      ],
    });
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitUntil(signedInAndHydrated(USERNAME));
    // The Create shipment and Post goods issue forms (a date and two rows) are taller than the default viewport.
    await una.setViewport(1280, 800);
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === "sh-ui-setup")!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await Promise.all([admin, una].map((browser) => browser.close()));
  });

  it("creates a shipment of both lines from the order's page, moving no stock (SAL-006, SAL-007, SAL-009)", async () => {
    await una.open(`${baseUrl}/admin/prod/customer-orders/${ids.order}`);
    await una.waitUntil(ready(button("Create shipment")));
    await una.clickRole("button", "Create shipment");
    await una.waitFor("[role=dialog]");
    expect(await una.fillDate("[role=dialog] input[type=date]", "2026-11-03")).toBe("2026-11-03");
    await una.fillLabel(lineLabel("Quantity to ship", 1, ids.widget, "sh widget"), "50");
    await una.fillLabel(lineLabel("Quantity to ship", 2, ids.gadget, "sh gadget"), "30");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitForText("Open shipment");
    const [shipment] = await tableRows(una, "Shipments");
    ids.shipment = shipment[0];
    expect(shipment).toEqual([expect.stringMatching(/^\d{8}$/), "2026-11-03", "Open", "Line 1: 0 of 50 each Line 2: 0 of 30 each"]);
    const stock = json(await api("GET", `/api/tenants/prod/stock?material=${ids.widget}&location=${ids.plant}`)).data as StockView;
    expect(stock.quantity).toBe("100.000000");
    expect((await order()).lines.map(({ fulfilled }) => fulfilled)).toEqual(["0.000000", "0.000000"]);
  });

  it("posts a partial goods issue on the shipment's page, lowering stock and fulfilling only that line (SAL-010, INV-003)", async () => {
    await una.open(`${baseUrl}/admin/prod/shipments/${ids.shipment}`);
    await una.waitUntil(ready(button("Post goods issue")));
    await una.clickRole("button", "Post goods issue");
    await una.waitFor("[role=dialog]");
    await una.fillLabel(lineLabel("Quantity issued", 1, ids.widget, "sh widget"), "20");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitForText("Line 1: 20 each");
    expect(await tableRows(una, "Lines")).toEqual([
      ["1", `${ids.widget} sh widget`, "50 each", "20 each", "30 each"],
      ["2", `${ids.gadget} sh gadget`, "30 each", "0 each", "30 each"],
    ]);
    const issues = await tableRows(una, "Goods issues");
    expect(issues).toEqual([[expect.stringMatching(/^\d{8}$/), new Date().toISOString().slice(0, 10), "Line 1: 20 each Reverse"]]);
    expect(await order()).toMatchObject({ status: "open", lines: [{ fulfilled: "20.000000" }, { fulfilled: "0.000000" }] });
    const stock = json(await api("GET", `/api/tenants/prod/stock?material=${ids.widget}&location=${ids.plant}`)).data as StockView;
    expect(stock.quantity).toBe("80.000000");
  });

  it("refuses an over-issue beside its line, then the exact final issue completes the shipment and the order (SAL-012, SAL-013, LFC-010)", async () => {
    await una.open(`${baseUrl}/admin/prod/shipments/${ids.shipment}`);
    await una.waitUntil(ready(button("Post goods issue")));
    await una.clickRole("button", "Post goods issue");
    await una.waitFor("[role=dialog]");
    await una.fillLabel(lineLabel("Quantity issued", 1, ids.widget, "sh widget"), "31");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitForText("This is more than this line has to issue");

    await una.fillLabel(lineLabel("Quantity issued", 1, ids.widget, "sh widget"), "30");
    await una.fillLabel(lineLabel("Quantity issued", 2, ids.gadget, "sh gadget"), "30");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitUntil(`!(${button("Post goods issue")}) && document.querySelector("[role=status]")`);
    expect(await una.text("[role=status]")).toContain("posted.");
    expect(await order()).toMatchObject({ status: "completed", lines: [{ fulfilled: "50.000000", status: "completed" }, { fulfilled: "30.000000", status: "completed" }] });

    await una.open(`${baseUrl}/admin/prod/customer-orders/${ids.order}`);
    await una.waitUntil(`[...document.querySelectorAll("main table[aria-label=Shipments]")].some((t) => !t.closest("[hidden]") && t.innerText.includes("Completed"))`);
    expect((await tableRows(una, "Shipments"))[0].slice(2)).toEqual(["Completed", "Line 1: 50 of 50 each Line 2: 30 of 30 each"]);
    expect(await una.evaluate<boolean>(`!${button("Create shipment")}`)).toBe(true);
  });

  /** A fresh Open order of 50 widgets and 30 gadgets, and a shipment of 20 widgets against it, through the API. */
  const shippedOrder = async () => {
    const orderId = await create("/api/tenants/prod/customer-orders", {
      customer: ids.retail,
      location: ids.plant,
      lines: [
        { material: ids.widget, quantity: "50", unit: "each", requiredDate: "2026-11-04" },
        { material: ids.gadget, quantity: "30", unit: "each", requiredDate: "2026-11-08" },
      ],
    });
    const lines = (json(await api("GET", `/api/tenants/prod/customer-orders/${orderId}`)).data as CustomerOrderView).lines;
    const shipment = await create("/api/tenants/prod/shipments", { customerOrder: orderId, plannedDate: "2026-11-03", lines: [{ orderLine: lines[0].id, quantity: "20", unit: "each" }] });
    return { orderId, shipment };
  };

  it("edits a shipment's plan on its page: a new date, a lowered line and the order's other line added (#147)", async () => {
    const { shipment } = await shippedOrder();
    await una.open(`${baseUrl}/admin/prod/shipments/${shipment}`);
    await una.waitUntil(ready(button("Edit shipment")));
    await una.clickRole("button", "Edit shipment");
    await una.waitFor("[role=dialog]");
    expect(await una.fillDate("[role=dialog] input[type=date]", "2026-11-12")).toBe("2026-11-12");
    await una.fillLabel(lineLabel("Quantity to ship", 1, ids.widget, "sh widget"), "15");
    await una.fillLabel(`Quantity to ship, Order line 2: ${ids.gadget} sh gadget`, "5");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitUntil(`document.querySelector("main dl")?.innerText.includes("2026-11-12")`);
    expect(await tableRows(una, "Lines")).toEqual([
      ["1", `${ids.widget} sh widget`, "15 each", "0 each", "15 each"],
      ["2", `${ids.gadget} sh gadget`, "5 each", "0 each", "5 each"],
    ]);
  });

  it("cancels a shipment nothing was issued against after confirming, leaving it Cancelled with no controls (#147)", async () => {
    const { shipment } = await shippedOrder();
    await una.open(`${baseUrl}/admin/prod/shipments/${shipment}`);
    await una.waitUntil(ready(button("Cancel shipment")));
    await una.clickRole("button", "Cancel shipment");
    await una.waitFor("[role=alertdialog]");
    expect(await una.text("[role=alertdialog] p")).toBe("It will plan nothing more. Stock and the order are not changed.");
    await una.click("[role=alertdialog] button[data-variant=destructive]");
    await una.waitUntil(`!document.querySelector("[role=alertdialog]")`);

    await una.waitUntil(`document.querySelector("main dl")?.innerText.includes("Cancelled")`);
    expect(await una.evaluate<boolean>(`!${button("Edit shipment")} && !${button("Cancel shipment")} && !${button("Post goods issue")}`)).toBe(true);
    const stock = json(await api("GET", `/api/tenants/prod/stock?material=${ids.widget}&location=${ids.plant}`)).data as StockView;
    expect(stock.quantity).toBe("50.000000");
  });
});
