import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own token and records: other files share the app and its database.
const SETUP_TOKEN = "suint-setup";
const TABLE = "SU factors of the finished products";

const shown = (selector: string) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => !e.closest("[hidden]"))`;
const table = shown(`main table[aria-label='${TABLE}']`);

// #239: a product's SU factor is set as a conversion over the API, shows on the Statistical units page, and is never an entered unit.
describe("the statistical unit", () => {
  let admin: Browser;
  let secret: string;
  const ids: Record<"cabinet" | "letterbox" | "plant", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => json(await api("POST", path, body)).data.id as string;
  /** The page's rows for this file's products, as their cells' text. */
  const ownRows = (tenant: string) =>
    admin.open(`${baseUrl}/admin/${tenant}/statistical-units`).then(async () => {
      await admin.waitUntil(`Boolean(${table})`);
      return admin.evaluate<string[][]>(`[...${table}.querySelectorAll("tbody tr")].map((row) => [...row.cells].map((cell) => cell.innerText.trim().replace(/\\s+/g, " ")))`);
    });

  beforeAll(async () => {
    admin = openBrowser();
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await admin.setViewport(1280, 800);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.cabinet = await create("/api/tenants/prod/materials", { type: "finished", description: "suint cabinet", baseUnit: "each" });
    ids.letterbox = await create("/api/tenants/prod/materials", { type: "finished", description: "suint letterbox", baseUnit: "each" });
    ids.plant = await create("/api/tenants/prod/locations", { name: "suint plant" });
    await api("POST", `/api/tenants/prod/materials/${ids.cabinet}/conversions`, { unit: "pallet", numerator: "10", denominator: "1" });
  });
  afterAll(async () => {
    // Other files expect the admin to hold no tokens: revoke this file's with itself.
    const own = (json(await callApi(baseUrl, "GET", "/api/tokens", secret)).data as { id: string; name: string }[]).find(({ name }) => name === SETUP_TOKEN)!;
    await callApi(baseUrl, "DELETE", `/api/tokens/${own.id}`, secret, { key: randomUUID() });
    await admin.close();
  });

  it("refuses SU as a base unit, on create and on edit", async () => {
    const refused = await api("POST", "/api/tenants/prod/materials", { type: "finished", description: "suint refused", baseUnit: "SU" });
    const rebased = await api("PATCH", `/api/tenants/prod/materials/${ids.letterbox}`, { version: 1, baseUnit: "SU" });

    expect(refused.status).toBe(400);
    expect(json(refused).error).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { baseUnit: ["The statistical unit can't be a base unit."] } });
    expect(rebased.status).toBe(400);
    expect(json(rebased).error.fieldErrors).toEqual({ baseUnit: ["The statistical unit can't be a base unit."] });
    const all = json(await api("GET", "/api/tenants/prod/materials?q=suint")).data as { description: string; baseUnit: string }[];
    expect(all.map(({ description, baseUnit }) => `${description} ${baseUnit}`)).toEqual(["suint cabinet each", "suint letterbox each"]);
  });

  it("sets a factor through the material-conversion API, shows it on the page, and refuses a quantity entered in SU", async () => {
    // 1 each = 1.5 SU: 1 SU = 1 / 1.5 each.
    const added = await api("POST", `/api/tenants/prod/materials/${ids.cabinet}/conversions`, { unit: "SU", numerator: "1", denominator: "1.5" });
    expect(added.status).toBe(200);
    expect(json(added).data).toMatchObject({ unit: "SU", numerator: "1", denominator: "1.5", inverse: "1.5" });

    const rows = (await ownRows("prod")).filter(([product]) => product.includes("suint"));
    expect(rows).toEqual([
      [`${ids.cabinet} — suint cabinet`, "1 each = 1.5 SU", "1 pallet = 15 SU", "Change"],
      [`${ids.letterbox} — suint letterbox`, "Not set", "", "Change"],
    ]);
    await admin.clickRole("link", `Change the SU factor of ${ids.letterbox} suint letterbox`);
    await admin.waitUntil(`location.pathname === "/admin/prod/materials/${ids.letterbox}"`);

    const before = json(await api("GET", `/api/tenants/prod/stock?material=${ids.cabinet}&location=${ids.plant}`)).data as { movementCount: number };
    const entered = await api("POST", "/api/tenants/prod/stock/corrections", { material: ids.cabinet, location: ids.plant, quantity: "2", unit: "SU", reason: "suint count" });
    expect(entered.status).toBe(400);
    expect(json(entered).error.code).toBe("UNIT_NOT_CONVERTIBLE");
    const after = json(await api("GET", `/api/tenants/prod/stock?material=${ids.cabinet}&location=${ids.plant}`)).data as { movementCount: number; quantity: string };
    expect(after).toMatchObject({ movementCount: before.movementCount, quantity: "0.000000" });
  });

  it("gives the Test dataset's finished products their SU factors", async () => {
    const rows = await ownRows("test");
    expect(rows.find(([product]) => product.endsWith("— Cabinet, red"))?.slice(1, 3)).toEqual(["1 each = 1 SU", "1 pallet = 20 SU"]);
    expect(rows.find(([product]) => product.endsWith("— Locker, 2 compartments, grey"))?.slice(1, 3)).toEqual(["1 each = 0.8 SU", "1 pallet = 6.4 SU"]);
  });
});
