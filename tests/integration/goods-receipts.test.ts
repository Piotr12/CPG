import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { OrderView, StockView } from "@cpg/core";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account: users are never deleted. Any signed-in account may post goods receipts.
const USERNAME = "gr-una";
const PASSWORD = "gr una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
const button = (name: string) => `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
const closed = `!document.querySelector("[role=dialog]")`;

/** The rows of the shown table named `name`, as their cells' text. */
const tableRows = (browser: Browser, name: string) =>
  browser.evaluate<string[][]>(`(() => {
    const table = [...document.querySelectorAll("main table")].find((t) => t.getAttribute("aria-label") === ${JSON.stringify(name)} && !t.closest("[hidden]"));
    return [...table.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")));
  })()`);

// E09-S02: a normal user posts goods receipts from a purchase order's page, in a real browser.
describe("goods receipts in the UI", () => {
  let admin: Browser;
  let una: Browser;
  let secret: string;
  const ids: Record<"steel" | "bolt" | "plant" | "acme" | "order", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => json(await api("POST", path, body)).data.id as string;
  const lineLabel = (field: string, line: number, material: string, description: string) => `${field}, Line ${line}: ${material} ${description}`;

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, "gr-ui-setup");
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "gr steel", baseUnit: "kg" });
    ids.bolt = await create("/api/tenants/prod/materials", { type: "raw", description: "gr bolt", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "gr plant" });
    ids.acme = await create("/api/tenants/prod/suppliers", { name: "gr acme" });
    ids.order = await create("/api/tenants/prod/purchase-orders", {
      supplier: ids.acme,
      location: ids.plant,
      lines: [
        { material: ids.steel, quantity: "100", unit: "kg", plannedDate: "2026-10-13" },
        { material: ids.bolt, quantity: "10", unit: "each", plannedDate: "2026-10-14" },
      ],
    });
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitUntil(signedInAndHydrated(USERNAME));
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === "gr-ui-setup")!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await Promise.all([admin, una].map((browser) => browser.close()));
  });

  it("posts a receipt with an excess and a partial line, warns, and shows received and outstanding (BUY-010, BUY-012, BUY-015)", async () => {
    await una.open(`${baseUrl}/admin/prod/purchase-orders/${ids.order}`);
    await una.waitUntil(ready(button("Post goods receipt")));
    await una.clickRole("button", "Post goods receipt");
    await una.waitFor("[role=dialog]");
    await una.fillLabel(lineLabel("Quantity received", 1, ids.steel, "gr steel"), "110");
    await una.fillLabel(lineLabel("Quantity received", 2, ids.bolt, "gr bolt"), "4");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitForText("Line 1 received 10 kg more than was outstanding.");
    await una.waitForText("Line 2: 4 each");
    const lines = await tableRows(una, "Lines");
    expect(lines.map((row) => row.slice(-5))).toEqual([
      ["110 kg", "0 kg", "Received", "0 kg", ""],
      ["4 each", "6 each", "Open", "0 each", "Change date Close Early"],
    ]);
    const receipts = await tableRows(una, "Goods receipts");
    expect(receipts).toHaveLength(1);
    expect(receipts[0][0]).toMatch(/^\d{8}$/);
    expect(receipts[0][1]).toBe(new Date().toISOString().slice(0, 10));
    expect(receipts[0][2]).toBe("Line 1: 110 kg Reverse Line 2: 4 each Reverse");

    const stock = json(await api("GET", `/api/tenants/prod/stock?material=${ids.steel}&location=${ids.plant}`)).data as StockView;
    expect(stock.quantity).toBe("110.000000");
  });

  it("changes the partly received line's planned date on screen, leaving what it received unchanged (BUY-024, #142)", async () => {
    const before = json(await api("GET", `/api/tenants/prod/purchase-orders/${ids.order}`)).data as OrderView;
    const label = `Change date — Purchase orders ${ids.order} — Line 2`;
    await una.open(`${baseUrl}/admin/prod/purchase-orders/${ids.order}`);
    await una.waitUntil(ready(`document.querySelector(${JSON.stringify(`main button[aria-label="${label}"]`)})`));
    // Line 1 received everything, so only line 2 offers it.
    expect(await una.evaluate<number>(`document.querySelectorAll('main button[aria-label^="Change date"]').length`)).toBe(1);

    await una.clickRole("button", label);
    await una.waitFor("[role=dialog]");
    expect(await una.evaluate<string>(`document.querySelector("[role=dialog] [name=plannedDate]").value`)).toBe("2026-10-14");
    expect(await una.fillDate("[role=dialog] [name=plannedDate]", "2026-10-28")).toBe("2026-10-28");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitForText("2026-10-28");
    expect((await tableRows(una, "Lines"))[1].slice(4, 8)).toEqual(["2026-10-28", "—", "4 each", "6 each"]);
    const after = json(await api("GET", `/api/tenants/prod/purchase-orders/${ids.order}`)).data as OrderView;
    expect(after.version).toBe(before.version + 1);
    expect(after.lines.map(({ plannedDate, received, quantity }) => [plannedDate, received, quantity])).toEqual([
      ["2026-10-13", "110.000000", "100.000000"],
      ["2026-10-28", "4.000000", "10.000000"],
    ]);
    const audit = json(await api("GET", `/api/tenants/prod/audit?subjectType=PurchaseOrder&subjectId=${ids.order}`)).data.entries as {
      action: string;
      channel: string;
      actor: { username: string };
      before: unknown;
      after: unknown;
    }[];
    expect(audit[0]).toMatchObject({
      action: "purchase-orders.purchase-order.updated",
      channel: "ui",
      actor: { username: USERNAME },
      before: { line2PlannedDate: "2026-10-14" },
      after: { line2PlannedDate: "2026-10-28" },
    });
  });

  it("completes the order on the last outstanding quantity and offers no more receipts (BUY-016, LFC-008)", async () => {
    await una.open(`${baseUrl}/admin/prod/purchase-orders/${ids.order}`);
    await una.waitUntil(ready(button("Post goods receipt")));
    await una.clickRole("button", "Post goods receipt");
    await una.waitFor("[role=dialog]");
    await una.fillLabel(lineLabel("Quantity received", 2, ids.bolt, "gr bolt"), "6");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);

    await una.waitUntil(`!(${button("Post goods receipt")}) && document.querySelector("[role=status]")`);
    expect(await una.text("[role=status]")).toContain("posted.");
    expect((json(await api("GET", `/api/tenants/prod/purchase-orders/${ids.order}`)).data as OrderView).status).toBe("completed");
    expect(await tableRows(una, "Goods receipts")).toHaveLength(2);
  });
});
