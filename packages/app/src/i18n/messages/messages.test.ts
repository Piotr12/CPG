import { describe, expect, it } from "vitest";
import { fill } from "../fill";
import { en } from "./en";
import { pl } from "./pl";

/**
 * Every key path in a dictionary, with arrays indexed, so the two can be compared shape for shape.
 * Joined with `/`: some keys (audit action IDs) contain dots.
 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}/${key}` : key));
}

describe("dictionaries", () => {
  it("have the same keys in English and Polish", () => {
    expect(keyPaths(pl)).toEqual(keyPaths(en));
  });

  it("translate every string rather than copy it (aside from words Polish shares: the product name, Menu, Status, ID, BOM, Import, Problem, API, a dash, a number, and templates that are only placeholders)", () => {
    const copied = keyPaths(en).filter((path) => {
      const read = (dictionary: object) => path.split("/").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary);
      return typeof read(en) === "string" && read(en) === read(pl);
    });

    expect(copied).toEqual([
      "home/title",
      "materials/columns/status",
      "materials/conversions/tiny",
      "locations/columns/id",
      "locations/columns/status",
      "customers/columns/id",
      "customers/columns/status",
      "suppliers/columns/id",
      "suppliers/columns/status",
      "safetyStock/columns/status",
      "productionOrders/id",
      "productionOrders/status",
      "customerOrders/status",
      "boms/columns/id",
      "boms/columns/status",
      "boms/noEnd",
      "boms/details/status",
      "purchaseRequisitions/columns/status",
      "purchaseOrders/columns/status",
      "purchaseOrders/details/status",
      "purchaseOrders/lines/columns/status",
      "purchaseOrders/lines/noRequisition",
      "transfers/columns/status",
      "transfers/route",
      "transfers/plannedDates",
      "transfers/details/status",
      "transfers/ledger/by",
      "transfers/ledger/channels/api",
      "shipments/columns/status",
      "shipments/details/status",
      "imports/problems/problem",
      "imports/change/empty",
      "imports/records/BOM",
      "audit/subjects/Bom",
      "audit/fields/bom",
      "audit/fields/id",
      "stock/channels/api",
      // "1 {unit} = {factor} SU": only placeholders, a number and the unit symbol.
      "demandReview/factor",
      "nav/menu",
      "nav/import",
      "nav/roles/admin",
    ]);
  });

  /** Every string value of a dictionary, the product name aside. */
  const strings = (dictionary: object) =>
    keyPaths(dictionary)
      .filter((path) => path !== "home/title")
      .map((path) => path.split("/").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary))
      .filter((value): value is string => typeof value === "string");

  it("speak plainly: no emoji and no caveman voice, the product name aside", () => {
    for (const dictionary of [en, pl]) {
      expect(strings(dictionary).filter((text) => /\p{Extended_Pictographic}|cave|jaskini/iu.test(text))).toEqual([]);
    }
  });

  it("say SU is never entered in every tooltip of a field where a unit is chosen or converted (D08, UX-014, #290)", () => {
    for (const dictionary of [en, pl]) {
      const { productionOrders: orders, materials, boms } = dictionary;
      const tips = [orders.quantityTip, orders.quantityTipBaseOnly, orders.quantityTipAny, materials.conversions.denominatorTip, materials.conversions.numeratorTip, boms.form.quantityTip, boms.form.quantityTipAny];
      expect(tips.filter((text) => !text.includes("SU"))).toEqual([]);
    }
  });

  it("say BOM, never recipe: one term per concept (design system v1, Principle 7; #206)", () => {
    expect(strings(en).filter((text) => /recipe/i.test(text))).toEqual([]);
    expect(strings(pl).filter((text) => /receptur/i.test(text))).toEqual([]);
  });

  it("name the Tenants page and a tenant's Overview with the sidebar's words", () => {
    expect([en.admin.heading, en.admin.tenantHeading]).toEqual([en.nav.tenantsPage, en.nav.overview]);
    expect([pl.admin.heading, pl.admin.tenantHeading]).toEqual([pl.nav.tenantsPage, pl.nav.overview]);
    expect(en.errors.TENANT_READ_ONLY).toContain("on the Tenants page.");
    expect(pl.errors.TENANT_READ_ONLY).toContain("na stronie Środowiska.");
  });

  it("title production orders as {Concept} — {Tenant} in both languages", () => {
    expect(fill(en.productionOrders.heading, { tenant: "Test" })).toBe("Production orders — Test");
    expect(fill(pl.productionOrders.heading, { tenant: "Test" })).toBe("Zlecenia produkcyjne — Test");
  });

  it("word the not-found pages and the no-JavaScript notice in both languages", () => {
    expect(en.notFound).toEqual({
      title: "Page not found.",
      description: "The address may be mistyped, or the record belongs to the other tenant.",
      goToTenants: "Go to Tenants",
      backTo: "Back to {list}",
      backToOverview: "Back to Overview — {tenant}",
    });
    expect(fill(pl.notFound.backTo, { list: "Materiały" })).toBe("Wróć do listy: Materiały");
    expect(fill(pl.notFound.backToOverview, { tenant: "Test" })).toBe("Wróć do strony Przegląd — Test");
    expect(en.noscript).toBe("CPG needs JavaScript. Turn it on in your browser and reload this page.");
    expect(pl.noscript).toBe("CPG wymaga JavaScriptu. Włącz go w przeglądarce i odśwież tę stronę.");
  });

  it("name a BOM's page in both languages", () => {
    expect(en.boms.detailHeading("00000003", "Cabinet, red")).toBe("BOM 00000003 — Cabinet, red");
    expect(pl.boms.detailHeading("00000003", "Szafka")).toBe("BOM 00000003 — Szafka");
  });

  it.each([
    ["migrationsApplied", "3 migrations applied", "Zastosowane migracje: 3"],
    ["migrationsPending", "3 pending", "Oczekujące: 3"],
    ["settings", "3 settings", "Ustawienia: 3"],
  ] as const)("formats %s counts in both languages", (key, english, polish) => {
    expect(en.admin[key](3)).toBe(english);
    expect(pl.admin[key](3)).toBe(polish);
  });

  it("names the tenant switch in both languages", () => {
    expect(en.nav.tenantSwitch("Test")).toBe("Tenant: Test");
    expect(pl.nav.tenantSwitch("Test")).toBe("Środowisko: Test");
    expect(en.nav.menuShows("Prod")).toBe("Menu shows: Prod");
    expect(pl.nav.menuShows("Prod")).toBe("Menu pokazuje: Prod");
  });

  it("names a tenant's audit in both languages", () => {
    expect(en.audit.tenantHeading("Test")).toBe("Audit — Test");
    expect(pl.audit.tenantHeading("Test")).toBe("Audyt — Test");
  });

  it("formats help search results in both languages", () => {
    expect(en.help.matches(1, "x")).toBe("1 topic matches “x”.");
    expect(en.help.matches(2, "x")).toBe("2 topics match “x”.");
    expect(pl.help.matches(2, "x")).toBe("Pasujące tematy dla „x”: 2.");
    expect(en.help.noMatch("x")).toBe("No help topics match “x”.");
    expect(pl.help.noMatch("x")).toBe("Żaden temat nie pasuje do „x”.");
    expect(en.help.screen("/login")).toBe("Screen: /login");
    expect(pl.help.screen("/login")).toBe("Ekran: /login");
  });
});
