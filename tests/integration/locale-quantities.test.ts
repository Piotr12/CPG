import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { callApi, json } from "./api";
import { openBrowser, type Browser } from "./browser";
import { choosePreference, signedInAndHydrated, signIn, signInAsAdmin } from "./sign-in";
import { createToken, openTokens } from "./tokens";
import { createUser } from "./users";

const baseUrl = inject("baseUrl");
const adminPassword = inject("adminPassword");

// This file's own account, token and records: users are never deleted, and other files share the app.
const USERNAME = "locqty-lena";
const PASSWORD = "locqty lena's first password";
const SETUP_TOKEN = "locqty-setup";

/** Whether a shown (not Next.js-staged) table cell or stock figure holds `text`. */
const showsText = (text: string) =>
  `[...document.querySelectorAll("main td, main [data-stock-balance]")].some((cell) => !cell.closest("[hidden]") && cell.textContent.includes(${JSON.stringify(text)}))`;

// #304: every screen shows a quantity, and a conversion factor, in the reader's locale, as the MRP report does.
// Each figure has five integer digits and a decimal, so both the grouping and the decimal separator show.
describe("quantities in the reader's locale (#304)", () => {
  let admin: Browser;
  let lena: Browser;
  let secret: string;
  const ids: Record<"sheet" | "cabinet" | "plant" | "supplier" | "order" | "bom", string> = {} as never;

  const api = (method: string, path: string, body?: unknown) => callApi(baseUrl, method, path, secret, body === undefined ? {} : { key: randomUUID(), body });
  const create = async (path: string, body: unknown) => {
    const response = await api("POST", path, body);
    expect(response.status, response.text).toBe(200);
    return json(response).data.id as string;
  };
  /** Opens a Prod page as Lena and waits until it shows `text`. */
  const read = async (path: string, text: string) => {
    await lena.open(`${baseUrl}/admin/prod${path}`);
    await lena.waitUntil(showsText(text));
    return true;
  };

  beforeAll(async () => {
    [admin, lena] = [openBrowser(), openBrowser()];
    await signInAsAdmin(admin, baseUrl, adminPassword);
    await openTokens(admin, baseUrl);
    secret = await createToken(admin, SETUP_TOKEN);
    ids.sheet = await create("/api/tenants/prod/materials", { type: "raw", description: "locqty sheet", baseUnit: "kg" });
    ids.cabinet = await create("/api/tenants/prod/materials", { type: "finished", description: "locqty cabinet", baseUnit: "each" });
    const conversion = await api("POST", `/api/tenants/prod/materials/${ids.sheet}/conversions`, { unit: "case", numerator: "12.5", denominator: "1" });
    expect(conversion.status, conversion.text).toBe(200);
    ids.plant = await create("/api/tenants/prod/locations", { name: "locqty plant" });
    ids.supplier = await create("/api/tenants/prod/suppliers", { name: "locqty supplier" });
    await create("/api/tenants/prod/stock/corrections", { material: ids.sheet, location: ids.plant, quantity: "12345.5", unit: "kg", reason: "locqty count" });
    ids.order = await create("/api/tenants/prod/purchase-orders", {
      supplier: ids.supplier, location: ids.plant, lines: [{ material: ids.sheet, quantity: "23456.75", unit: "kg", plannedDate: "2027-01-05" }],
    });
    // 1000.5 cases of 12.5 kg: a base quantity of 12,506.25 kg, entered in another unit.
    ids.bom = await create("/api/tenants/prod/boms", { output: ids.cabinet, priority: 1, validFrom: "2027-01-01", components: [{ material: ids.sheet, quantity: "1000.5", unit: "case" }] });
    await createUser(admin, baseUrl, USERNAME, PASSWORD);
    await signIn(lena, baseUrl, PASSWORD, USERNAME);
    await lena.waitUntil(signedInAndHydrated(USERNAME));
  });

  afterAll(async () => {
    if (lena) await choosePreference(lena, "en").catch(() => undefined);
    await Promise.all([admin?.close(), lena?.close()]);
  });

  it("groups thousands with a comma and keeps a decimal point for an English reader", async () => {
    expect(await read(`/stock?material=${ids.sheet}&location=${ids.plant}`, "12,345.5 kg")).toBe(true);
    expect(await read(`/purchase-orders/${ids.order}`, "23,456.75 kg")).toBe(true);
    expect(await read(`/boms/${ids.bom}`, "12,506.25 kg")).toBe(true);
  });

  it("uses a decimal comma and groups with a no-break space for a Polish reader, factor included", async () => {
    await choosePreference(lena, "pl");
    await lena.waitUntil(`document.documentElement.lang === "pl"`);
    expect(await read(`/stock?material=${ids.sheet}&location=${ids.plant}`, "12\u00a0345,5 kg")).toBe(true);
    expect(await read(`/purchase-orders/${ids.order}`, "23\u00a0456,75 kg")).toBe(true);
    expect(await read(`/boms/${ids.bom}`, "12\u00a0506,25 kg")).toBe(true);
    // The line was entered as 1000.5 cases, at 1 case = 12.5 kg: both figures follow the locale too.
    expect(await lena.evaluate<boolean>(showsText("1000,5 case"))).toBe(true);
    expect(await lena.evaluate<boolean>(showsText("1 case = 12,5 kg"))).toBe(true);
  });
});
