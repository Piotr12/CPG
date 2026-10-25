import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { StockView, TransferDetailView, TransferView } from "@cpg/core";
import { callApi, json } from "./api";
import { chooseFromList, clickHydrated, openBrowser, type Browser } from "./browser";
import { signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account: users are never deleted. Any signed-in account may transfer.
const USERNAME = "tr-una";
const PASSWORD = "tr una's first password";

/** True once `element` is hydrated, shown, and outside Next.js's hidden staging container. */
const ready = (element: string) =>
  `(${element}) && !(${element}).closest("[hidden]") && Object.keys(${element}).some((key) => key.startsWith("__reactFiber"))`;
const button = (name: string) => `[...document.querySelectorAll("main button")].find((b) => b.textContent.trim() === ${JSON.stringify(name)})`;
/** No dialog, and no overlay still fading out over the page. */
const closed = `!document.querySelector("[role=dialog]") && !document.querySelector("[data-slot=dialog-overlay]")`;
const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;

/** The rows of the shown table named `name`, as their cells' text. */
const tableRows = (browser: Browser, name: string) =>
  browser.evaluate<string[][]>(`(() => {
    const table = [...document.querySelectorAll("main table")].find((t) => t.getAttribute("aria-label") === ${JSON.stringify(name)} && !t.closest("[hidden]"));
    return [...table.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")));
  })()`);

// E07-S03: a normal user creates a transfer, dispatches, receives and writes off on its page, in a real browser.
describe("transfers in the UI", () => {
  let admin: Browser;
  let una: Browser;
  let secret: string;
  let transfer: string;
  const ids: Record<"steel" | "plant" | "depot", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => json(await api("POST", path, body)).data.id as string;
  const stock = async (location: string) => json(await api("GET", `/api/tenants/prod/stock?material=${ids.steel}&location=${location}`)).data as StockView;
  /** Opens a posting or dates dialog on the transfer's page by its button. */
  const openDialog = async (name: string) => {
    await una.waitUntil(ready(button(name)));
    await una.clickRole("button", name);
    await una.waitFor("[role=dialog]");
  };
  const submit = async () => {
    await una.click("[role=dialog] button[type=submit]");
    await una.waitUntil(closed);
  };
  const inTransit = (text: string) => una.waitUntil(`${shown("[data-transfer-in-transit]")}?.textContent === ${JSON.stringify(text)}`);

  beforeAll(async () => {
    [admin, una] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, "tr-ui-setup");
    ids.steel = await create("/api/tenants/prod/materials", { type: "raw", description: "tr steel", baseUnit: "kg" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "tr plant" });
    ids.depot = await create("/api/tenants/prod/locations", { name: "tr depot" });
    await api("POST", "/api/tenants/prod/stock/corrections", { material: ids.steel, location: ids.plant, quantity: "100", unit: "kg", reason: "tr opening" });
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(una, baseUrl, PASSWORD, USERNAME);
    await una.waitUntil(signedInAndHydrated(USERNAME));
    // The Create transfer form is taller than agent-browser's default viewport.
    await una.setViewport(1280, 800);
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === "tr-ui-setup")!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await Promise.all([admin, una].map((browser) => browser.close()));
  });

  it("creates an Open transfer from the Transfers page, changing no stock (TRF-001, TRF-003)", async () => {
    await una.open(`${baseUrl}/admin/prod/transfers`);
    await una.waitUntil(ready(button("Create transfer")));
    await una.clickRole("button", "Create transfer");
    await una.waitFor("[role=dialog]");
    // Each autocomplete found by the label that names it: the dialog has three (#222).
    const picker = (field: string) => `[role=dialog][data-state=open] [role=combobox][aria-labelledby$="-${field}-label"]`;
    await chooseFromList(una, picker("material"), `${ids.steel} tr steel`, ids.steel);
    await chooseFromList(una, picker("source"), ids.plant, ids.plant);
    await chooseFromList(una, picker("destination"), ids.depot, ids.depot);
    await una.fill("[role=dialog] input[name=quantity]", "100");
    expect(await una.fillDate("[role=dialog] input[name=plannedDispatch]", "2026-10-19")).toBe("2026-10-19");
    expect(await una.fillDate("[role=dialog] input[name=plannedArrival]", "2026-10-21")).toBe("2026-10-21");
    await submit();

    const created = (json(await api("GET", "/api/tenants/prod/transfers")).data as TransferView[]).find(({ material }) => material === ids.steel)!;
    transfer = created.id;
    await una.waitForText(`${ids.plant} tr plant → ${ids.depot} tr depot`);
    const row = (await tableRows(una, "Transfers")).find(([id]) => id === transfer)!;
    expect(row).toEqual([transfer, `${ids.steel} tr steel`, `${ids.plant} tr plant → ${ids.depot} tr depot`, "100 kg", "0 kg", "0 kg", "0 kg", "2026-10-19 → 2026-10-21", "Open"]);
    expect((await stock(ids.plant)).quantity).toBe("100.000000");
  });

  it("dispatches into transit, which the stock page shows apart from physical stock (TRF-004, INV-009, UX-017)", async () => {
    await una.open(`${baseUrl}/admin/prod/transfers/${transfer}`);
    await openDialog("Dispatch");
    await una.fill("[role=dialog] input[name=quantity]", "60");
    await submit();

    await inTransit("60 kg");
    await una.open(`${baseUrl}/admin/prod/stock?material=${ids.steel}&location=${ids.plant}`);
    await una.waitUntil(`${shown("[data-stock-transit-from]")}?.textContent === "60 kg"`);
    expect(await una.evaluate<string>(`${shown("[data-stock-balance]")}.textContent`)).toBe("40 kg");
    await una.waitUntil(`${shown("table[aria-label='Stock movements']")}?.textContent.includes("Transfer dispatch")`);
  });

  it("receives part, writes off the lost rest with a reason, and lists every leg in the ledger (TRF-006, TRF-013, TRF-024)", async () => {
    await una.open(`${baseUrl}/admin/prod/transfers/${transfer}`);
    await openDialog("Receive");
    await una.fill("[role=dialog] input[name=quantity]", "50");
    await submit();
    await inTransit("10 kg");

    await openDialog("Write off");
    await una.fill("[role=dialog] input[name=quantity]", "10");
    await una.fill("[role=dialog] input[name=reason]", "tr pallet lost");
    await submit();
    await inTransit("0 kg");

    // Nothing is in transit, so only Dispatch (40 left) and Change dates remain.
    await una.waitUntil(`!(${button("Receive")}) && !(${button("Write off")}) && ${button("Dispatch")}`);
    const ledger = (await tableRows(una, "Ledger")).map((row) => row.slice(0, 4));
    expect(ledger).toEqual([
      [new Date().toISOString().slice(0, 10), "Write-off", "In transit", "-10 kg"],
      [new Date().toISOString().slice(0, 10), "Receipt", "In transit", "-50 kg"],
      ["", "", `${ids.depot} tr depot (to)`, "+50 kg"],
      [new Date().toISOString().slice(0, 10), "Dispatch", `${ids.plant} tr plant (from)`, "-60 kg"],
      ["", "", "In transit", "+60 kg"],
    ]);
    expect((await stock(ids.depot)).quantity).toBe("50.000000");
    const detail = json(await api("GET", `/api/tenants/prod/transfers/${transfer}`)).data as TransferDetailView;
    expect(detail).toMatchObject({ received: "50.000000", writtenOff: "10.000000", status: "open" });
  });

  it("keeps a refused dispatch of more than is left open with its reason, and changes the planned dates (spec Q4, TRF-026)", async () => {
    await una.open(`${baseUrl}/admin/prod/transfers/${transfer}`);
    await openDialog("Dispatch");
    await una.fill("[role=dialog] input[name=quantity]", "41");
    await una.click("[role=dialog] button[type=submit]");
    await una.waitForText("Only 40.000000 kg is left to dispatch on transfer");
    await una.clickRole("button", "Cancel");
    await una.waitUntil(closed);

    await openDialog("Change dates");
    expect(await una.fillDate("[role=dialog] input[name=plannedArrival]", "2026-10-25")).toBe("2026-10-25");
    await submit();
    await una.waitForText("2026-10-25");
    expect((json(await api("GET", `/api/tenants/prod/transfers/${transfer}`)).data as TransferDetailView).plannedArrival).toBe("2026-10-25");
  });

  it("links the Open transfer that refuses deactivating its location or its material (LFC-018)", async () => {
    // Deactivation checks physical stock before transfers: this material and its locations are never stocked.
    const copper = await create("/api/tenants/prod/materials", { type: "raw", description: "tr copper", baseUnit: "kg" });
    const kiln = await create("/api/tenants/prod/locations", { name: "tr kiln" });
    const lake = await create("/api/tenants/prod/locations", { name: "tr lake" });
    const open = await create("/api/tenants/prod/transfers", { material: copper, source: kiln, destination: lake, quantity: "5", unit: "kg", plannedDispatch: "2026-11-02", plannedArrival: "2026-11-03" });
    const alert = "[role=alertdialog] [role=alert]";
    /** Confirms the open Deactivate dialog and returns its refusal's text and link. */
    const refusal = async () => {
      await admin.waitFor("[role=alertdialog]");
      await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
      await admin.waitUntil(`!!document.querySelector("${alert} a")`);
      return { text: await admin.text(alert), href: await admin.evaluate<string>(`document.querySelector("${alert} a").getAttribute("href")`) };
    };
    await admin.setViewport(1280, 800);

    await admin.open(`${baseUrl}/admin/prod/locations`);
    await admin.waitUntil(ready(`document.querySelector("main button[aria-label='Actions for ${kiln}']")`));
    await admin.clickRole("button", `Actions for ${kiln}`);
    await admin.clickRole("menuitem", "Deactivate");
    expect(await refusal()).toEqual({ text: `Transfer ${open} is still Open from or to this location. ${open}`, href: `/admin/prod/transfers/${open}` });
    await admin.clickRole("button", "Cancel");
    await admin.waitUntil(`!document.querySelector("[role=alertdialog]")`);

    await admin.open(`${baseUrl}/admin/prod/materials/${copper}`);
    await admin.waitUntil(ready(button("Deactivate")));
    await admin.clickRole("button", "Deactivate");
    expect(await refusal()).toEqual({ text: `Transfer ${open} of this material is still Open, so it can't be deactivated. ${open}`, href: `/admin/prod/transfers/${open}` });
    await admin.click(`${alert} a`);
    // The material's page stays mounted but hidden (display: none), its dialog with it: wait for the transfer's shown heading.
    await admin.waitUntil(
      `location.pathname === "/admin/prod/transfers/${open}" && [...document.querySelectorAll("main h1")].some((h) => h.offsetParent && h.textContent.startsWith("Transfer ${open}"))`,
    );
    expect(json(await api("GET", `/api/tenants/prod/locations/${kiln}`)).data.active).toBe(true);
    expect(json(await api("GET", `/api/tenants/prod/materials/${copper}`)).data.active).toBe(true);
  });

  it("sorts the transfers by a header and searches them by material and location, marking matches, and clears back (#217)", async () => {
    const brass = await create("/api/tenants/prod/materials", { type: "raw", description: "tr brass", baseUnit: "kg" });
    const back = await create("/api/tenants/prod/transfers", { material: brass, source: ids.depot, destination: ids.plant, quantity: "3", unit: "kg", plannedDispatch: "2026-11-05", plannedArrival: "2026-11-06" });
    /** Waits until the page's address has this query and the table under it is the new one. */
    const atQuery = (query: string) =>
      una.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);
    /** This file's two transfers between the plant and the depot, in the order the list shows them (other files may list more). */
    const own = async () => (await tableRows(una, "Transfers")).map(([id]) => id).filter((id) => id === transfer || id === back);

    await una.open(`${baseUrl}/admin/prod/transfers`);
    await una.waitUntil(`Boolean(document.querySelector("main [role=search] input[name=q]")) && Object.keys(document.querySelector("main [role=search] button")).some((key) => key.startsWith("__reactFiber"))`);
    await una.fill("main [role=search] input[name=q]", "tr brass");
    await una.click("main [role=search] button[type=submit]");
    await atQuery("?q=tr+brass");
    await una.waitFor("main [role=status]");
    expect((await tableRows(una, "Transfers")).map(([id, material]) => [id, material])).toEqual([[back, `${brass} tr brass`]]);
    expect(await una.text("main [role=status]")).toBe("1 result for “tr brass” · Clear search");
    expect(await una.evaluate<string[]>(`[...document.querySelectorAll("main tbody mark")].map((mark) => mark.textContent)`)).toEqual(expect.arrayContaining(["tr", "brass"]));

    // Both routes touch the plant; by material, steel (the older ID) comes first, then the other way.
    await una.open(`${baseUrl}/admin/prod/transfers?q=tr+plant`);
    await una.waitFor("main [role=status]");
    for (const [, , route] of await tableRows(una, "Transfers")) expect(route).toContain("tr plant");
    await clickHydrated(una, "main th a[href$='q=tr+plant&sort=material&dir=asc']");
    await atQuery("?q=tr+plant&sort=material&dir=asc");
    expect(await own()).toEqual([transfer, back]);
    await clickHydrated(una, "main th a[href$='q=tr+plant&sort=material&dir=desc']");
    await atQuery("?q=tr+plant&sort=material&dir=desc");
    await una.waitUntil(`document.querySelector("main th[aria-sort=descending]")?.innerText.trim() === "Material"`);
    expect(await own()).toEqual([back, transfer]);

    await clickHydrated(una, "main [role=status] a");
    await atQuery("?sort=material&dir=desc");
    await una.waitUntil(`document.querySelector("main [role=search] input[name=q]").value === "" && !document.querySelector("main [role=status]")`);
    expect(await own()).toEqual([back, transfer]);
  });
});
