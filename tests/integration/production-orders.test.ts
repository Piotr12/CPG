import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { ProductionOrderDetail, ProductionOptions } from "@cpg/core";
import { callApi, json } from "./api";
import { chooseFromList, openBrowser, clickHydrated, type Browser } from "./browser";
import { signIn, signInAsAdmin, signedInAndHydrated } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const password = inject("adminPassword");
const collection = "/api/tenants/prod/production-orders";
const userPassword = "production normal user password";

describe("manual production orders in the UI and API", () => {
  let admin: Browser; let user: Browser; let secret: string; let userSecret: string;
  let output: string; let steel: string; let plant: string; let otherSite: string; let top: string; let alternative: string;
  let pinned: ProductionOrderDetail;
  const api = (method: string, path: string, options: Parameters<typeof callApi>[4] = {}, token = secret) => callApi(baseUrl, method, path, token, options);
  const write = (method: string, path: string, body: unknown, token = secret) => api(method, path, { body, key: randomUUID() }, token);
  const createMaster = async (kind: string, body: unknown) => {
    const response = await write("POST", `/api/tenants/prod/${kind}`, body); expect(response.status).toBe(200); return json(response).data.id as string;
  };
  const input = () => ({ output, location: plant, quantity: "30", unit: "each", plannedFinish: "2026-10-15" });
  const stock = async () => json(await api("GET", `/api/tenants/prod/stock?material=${steel}&location=${plant}`)).data.quantity as string;
  const detail = async (id: string) => json(await api("GET", `${collection}/${id}`)).data as ProductionOrderDetail;
  const recipeBody = (priority: number, quantity: string) => ({ output, priority, validFrom: "2026-01-01", validThrough: null, components: [{ material: steel, quantity, unit: "kg" }] });

  beforeAll(async () => {
    admin = openBrowser(); user = openBrowser();
    await signInAsAdmin(admin, baseUrl, password); await openTokens(admin, baseUrl); secret = await createToken(admin, "production-admin");
    expect((await write("POST", "/api/users", { username: "production-una", password: userPassword })).status).toBe(200);
    await signIn(user, baseUrl, userPassword, "production-una"); await user.waitUntil(signedInAndHydrated("production-una"));
    await openTokens(user, baseUrl); userSecret = await createToken(user, "production-user");
    output = await createMaster("materials", { type: "finished", description: "production cabinet", baseUnit: "each" });
    steel = await createMaster("materials", { type: "raw", description: "production steel", baseUnit: "kg" });
    plant = await createMaster("locations", { name: "production plant" }); otherSite = await createMaster("locations", { name: "production depot" });
    expect((await write("POST", "/api/tenants/prod/planning-parameters", { material: output, location: plant, procurement: "make", leadTimeDays: 5, minimumQuantity: "1", lotMultiple: "1" })).status).toBe(200);
    top = await createMaster("boms", recipeBody(1, "2")); alternative = await createMaster("boms", recipeBody(2, "1"));
    expect((await write("POST", "/api/tenants/prod/stock/corrections", { material: steel, location: plant, quantity: "30", unit: "kg", reason: "Opening test stock" })).status).toBe(200);
  });
  afterAll(async () => {
    if (secret) {
      await write("PATCH", "/api/tenants/prod", { readOnly: false });
      const tokens = json(await api("GET", "/api/tokens")).data as { id: string; name: string }[];
      const own = tokens.find(({ name }) => name === "production-admin");
      if (own) await api("DELETE", `/api/tokens/${own.id}`, { key: randomUUID() });
    }
    await Promise.all([admin?.close(), user?.close()]);
  });

  it("defaults to the highest feasible recipe and lets a user pin a shortage recipe without changing stock (PRD-001/002/004/007/008/009/022)", async () => {
    const options = json(await api("GET", `${collection}/options?${new URLSearchParams(input())}`, {}, userSecret)).data as ProductionOptions;
    expect(options.selected).toEqual({ bom: alternative, revision: 1 });
    const key = randomUUID(); const body = { ...input(), bom: top, revision: 1 };
    const first = await api("POST", collection, { key, body }, userSecret); expect(first.status).toBe(200);
    pinned = json(first).data as ProductionOrderDetail;
    expect(pinned).toMatchObject({ output, location: plant, bom: top, revision: 1, quantity: "30.000000", plannedFinish: "2026-10-15", plannedStart: "2026-10-10", status: "open" });
    expect(pinned.shortages).toEqual([expect.objectContaining({ material: steel, required: "60.000000", available: "30.000000", shortage: "30.000000" })]);
    const replay = await api("POST", collection, { key, body }, userSecret); expect(replay.replayed).toBe("true"); expect(json(replay).data.id).toBe(pinned.id);
    expect((await write("POST", collection, input())).status).toBe(200); expect(await stock()).toBe("30.000000");
  });
  it("lets a normal user preview, choose a lower-priority recipe and save/edit through the UI (PRD-003/025/027)", async () => {
    await user.setViewport(1280, 800); await user.open(`${baseUrl}/admin/prod/production-orders`);
    await clickHydrated(user, "main button"); await user.waitFor("[role=dialog][data-state=open]");
    // Each picker by its label (#222): the dialog has an output and a location combobox.
    await chooseFromList(user, '[role=dialog][data-state=open] [role=combobox][aria-labelledby$="-output-label"]', output, output);
    await chooseFromList(user, '[role=dialog][data-state=open] [role=combobox][aria-labelledby$="-location-label"]', plant, plant);
    await user.fill("[role=dialog][data-state=open] [name=quantity]", "60"); await user.fill("[role=dialog][data-state=open] [name=unit]", "each");
    await user.fillDate("[role=dialog][data-state=open] [name=plannedFinish]", "2026-10-15"); await user.click("[role=dialog][data-state=open] button[type=submit]");
    await user.waitFor("[role=dialog][data-state=open] [name=bom]");
    expect(await user.evaluate<string>('document.querySelector("[role=dialog][data-state=open] [name=bom]").value')).toBe(top);
    expect(await user.text("[role=dialog][data-state=open]")).toContain("30 kg");
    await user.select("[role=dialog][data-state=open] [name=bom]", alternative); await user.click("[role=dialog][data-state=open] button[type=submit]");
    await user.waitUntil('![...document.querySelectorAll("[role=dialog], [data-slot=dialog-overlay]")].some((el) => el.getClientRects().length > 0)');
    await user.waitUntil('location.pathname.split("/").at(-2) === "production-orders" && /^[0-9]{8}$/.test(location.pathname.split("/").at(-1)) && !!document.querySelector("main [data-slot=callout]")');
    const id = (await user.url()).split("/").at(-1)!;
    expect(await detail(id)).toMatchObject({ bom: alternative, revision: 1, quantity: "60.000000" });
    expect(await user.text("main [data-slot=callout][data-tone=warning]")).toContain("1 component short");
    await clickHydrated(user, "main button"); await user.waitFor("[role=dialog][data-state=open]");
    await user.fill("[role=dialog][data-state=open] [name=quantity]", "65"); await user.fillDate("[role=dialog][data-state=open] [name=plannedFinish]", "2026-10-16");
    await user.click("[role=dialog][data-state=open] button[type=submit]"); await user.waitUntil('!document.querySelector("[role=dialog][data-state=open]")');
    await user.waitForText("2026-10-11");
    expect(await detail(id)).toMatchObject({ quantity: "65.000000", plannedFinish: "2026-10-16", plannedStart: "2026-10-11", bom: alternative, version: 2 });
    expect(await stock()).toBe("30.000000");
    await user.setViewport(390, 844);
    expect(await user.evaluate<boolean>('document.documentElement.scrollWidth <= innerWidth')).toBe(true);
    expect(await user.evaluate<boolean>('(() => { const b = document.querySelector("main button").getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; })()')).toBe(true);
  });
  it("sorts the orders by a header click, searches them by output, and clears back (#217)", async () => {
    const atQuery = (query: string) =>
      user.waitUntil(`location.search === ${JSON.stringify(query)} && document.querySelector("main [aria-sort]") && !document.querySelector("main table").closest("[hidden]")`);
    const column = (index: number) => user.evaluate<string[]>(`[...document.querySelectorAll("main tbody tr")].map((row) => row.cells[${index}].innerText.trim())`);
    await user.setViewport(1280, 800); await user.open(`${baseUrl}/admin/prod/production-orders`);
    await user.waitUntil(`document.querySelector("main th[aria-sort=ascending]")?.innerText.trim() === "ID"`);

    await clickHydrated(user, "main th a[href$='sort=finish&dir=asc']");
    await atQuery("?sort=finish&dir=asc");
    const finishes = await column(4);
    expect(finishes.length).toBeGreaterThanOrEqual(2);
    expect(finishes).toEqual([...finishes].sort());
    await clickHydrated(user, "main th a[href$='sort=finish&dir=desc']");
    await atQuery("?sort=finish&dir=desc");
    await user.waitUntil(`document.querySelector("main th[aria-sort=descending]")?.innerText.trim() === "Planned finish"`);
    expect(await column(4)).toEqual([...finishes].sort().reverse());

    await user.waitUntil(`Object.keys(document.querySelector("main [role=search] button")).some((key) => key.startsWith("__reactFiber"))`);
    await user.fill("main [role=search] input[name=q]", "production cabinet");
    await user.click("main [role=search] button[type=submit]");
    await atQuery("?q=production+cabinet&sort=finish&dir=desc");
    const outputs = await column(1);
    expect(outputs.length).toBeGreaterThanOrEqual(2);
    for (const shown of outputs) expect(shown).toBe(`${output} production cabinet`);
    expect(await user.text("main p[role=status]")).toBe(`${outputs.length} results for “production cabinet” · Clear search`);
    expect(await user.evaluate<number>(`document.querySelectorAll("main tbody tr td:nth-child(2) mark").length`)).toBe(outputs.length * 2);

    await clickHydrated(user, "main p[role=status] a");
    await atQuery("?sort=finish&dir=desc");
    expect((await column(4)).length).toBeGreaterThanOrEqual(outputs.length);
    await user.open(`${baseUrl}/admin/prod/production-orders?q=no+such+order+anywhere`);
    await user.waitForText("Nothing matches “no such order anywhere”.");
  });
  it("retains pinned history after BOM revision/deactivation and audits target/date edits (PRD-006)", async () => {
    const bom = json(await api("GET", `/api/tenants/prod/boms/${top}`)).data;
    expect((await write("PATCH", `/api/tenants/prod/boms/${top}`, { version: bom.version, components: [{ material: steel, quantity: "3", unit: "kg" }], active: false })).status).toBe(200);
    expect(await detail(pinned.id)).toMatchObject({ bom: top, revision: 1, components: [{ quantity: "2.000000" }] });
    const updated = await write("PATCH", `${collection}/${pinned.id}`, { version: 1, quantity: "40", plannedFinish: "2026-10-16" }, userSecret);
    expect(json(updated).data).toMatchObject({ revision: 1, quantity: "40.000000", plannedStart: "2026-10-11", version: 2 });
    expect((await write("PATCH", `${collection}/${pinned.id}`, { version: 1, quantity: "50" })).status).toBe(409);
    const entries = json(await api("GET", "/api/tenants/prod/audit?limit=100")).data.entries as { action: string; subject: { id: string }; before: unknown; after: unknown }[];
    const edit = entries.find((entry) => entry.action === "production-orders.production-order.updated" && entry.subject.id === pinned.id);
    expect(edit).toMatchObject({ before: { quantity: "30.000000" }, after: { quantity: "40.000000", revision: 1 } });
    expect(await stock()).toBe("30.000000");
    await user.open(`${baseUrl}/admin/prod/audit`); await user.waitForText("Production order changed");
    const shownAudit = await user.text("main");
    expect(shownAudit).not.toContain("production-orders.production-order.");
    expect(shownAudit).toContain("planned finish");
  });
  it("refuses invalid selections, raw/Buy output, unknown tenant records, missing keys and locked fields (PRD-005, R02, R07)", async () => {
    for (const body of [{ ...input(), output: steel }, { ...input(), location: otherSite }, { ...input(), plannedFinish: "2025-01-01" }, { ...input(), bom: top, revision: 1 }, { ...input(), output: "99999999" }]) {
      expect((await write("POST", collection, body)).status).toBeGreaterThanOrEqual(400);
    }
    expect((await api("POST", collection, { body: input() })).status).toBe(400);
    for (const field of ["output", "location", "bom", "revision", "plannedStart", "produced", "status"]) expect((await write("PATCH", `${collection}/${pinned.id}`, { version: 2, [field]: "changed" })).status).toBe(400);
    expect((await api("GET", `${collection}/99999999`)).status).toBe(404);
    expect((await api("GET", `${collection}?page=0`)).status).toBe(400);
    expect(json(await api("GET", `${collection}?page=2`)).data).toEqual([]);
  });
  it("refuses location/output deactivation and links the blocking order (LFC-018)", async () => {
    for (const kind of ["locations", "materials"]) {
      const id = kind === "locations" ? plant : output;
      const record = json(await api("GET", `/api/tenants/prod/${kind}/${id}`)).data;
      const response = await write("PATCH", `/api/tenants/prod/${kind}/${id}`, { version: record.version, active: false });
      expect(response.status).toBe(409); expect(json(response).error.params.order).toMatch(/^\d{8}$/);
    }
    await admin.setViewport(1280, 800); await admin.open(`${baseUrl}/admin/prod/materials/${output}`);
    await admin.waitUntil('[...document.querySelectorAll("main button")].some((button) => button.textContent.trim() === "Deactivate" && Object.keys(button).some((key) => key.startsWith("__reactFiber")))');
    await admin.clickRole("button", "Deactivate"); await admin.waitFor("[role=alertdialog]");
    await admin.click("[role=alertdialog] button[data-variant=destructive-solid]");
    await admin.waitUntil('!!document.querySelector("[role=alertdialog] [role=alert] a")');
    expect(await admin.evaluate<string>('document.querySelector("[role=alertdialog] [role=alert] a").getAttribute("href")')).toBe(`/admin/prod/production-orders/${pinned.id}`);
    await admin.clickRole("button", "Cancel");
  });
  it("enforces read-only, Test generation and isolation while keeping preview readable (R05, R07, D06)", async () => {
    // The dataset's first order is the first week's earliest completion: side panels on most days, locker frames when the opening stock covers the panels.
    expect(json(await api("GET", "/api/tenants/test/production-orders")).data[0]).toMatchObject({ id: "00000001", output: expect.stringMatching(/^000000(04|16)$/) });
    const demo = { output: "00000004", location: "00000001", quantity: "1", unit: "each", plannedFinish: "2026-11-15" };
    expect((await write("POST", "/api/tenants/test/production-orders", demo)).status).toBe(428);
    const generation = json(await api("GET", "/api/tenants/test")).data.generation as number;
    expect((await api("POST", "/api/tenants/test/production-orders", { key: randomUUID(), generation: generation + 1, body: demo })).status).toBe(409);
    const testMaterialIds = new Set<string>((json(await api("GET", "/api/tenants/test/materials")).data as { id: string }[]).map(({ id }) => id));
    let prodOnly = output;
    while (testMaterialIds.has(prodOnly)) prodOnly = await createMaster("materials", { type: "raw", description: "production Prod-only reference", baseUnit: "kg" });
    expect((await api("POST", "/api/tenants/test/production-orders", { key: randomUUID(), generation, body: { ...input(), output: prodOnly } })).status).toBe(404);
    expect((await write("PATCH", "/api/tenants/prod", { readOnly: true })).status).toBe(200);
    try {
      expect((await write("POST", collection, input(), userSecret)).status).toBe(409);
      expect((await write("PATCH", `${collection}/${pinned.id}`, { version: 2, quantity: "41" }, userSecret)).status).toBe(409);
      expect((await api("GET", `${collection}/options?${new URLSearchParams(input())}`, {}, userSecret)).status).toBe(200);
      await user.open(`${baseUrl}/admin/prod/production-orders`); await user.waitForText("Production orders");
      await user.waitUntil('document.querySelector("main table") && !document.querySelector("main table").closest("[hidden]")');
      // Only the list's own Search button: nothing that changes data.
      expect(await user.evaluate<string[]>('[...document.querySelectorAll("main button")].map((button) => button.textContent.trim())')).toEqual(["Search"]);
    } finally { await write("PATCH", "/api/tenants/prod", { readOnly: false }); }
  });
});
