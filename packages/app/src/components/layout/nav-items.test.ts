import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { navModel } from "./nav-items";
import type { NavItem } from "./nav-tree";

/** The tree as ids, groups as `[id, children]`. */
const shape = (items: NavItem[]): unknown[] => items.map((item) => ("children" in item ? [item.id, shape(item.children)] : item.id));

describe("navModel", () => {
  it("gives a visitor no sidebar", () => {
    expect(navModel(null, en.nav)).toBeNull();
  });

  it("gives a normal user the tenant tree and the shared screens, without Administration", () => {
    const model = navModel({ role: "user" }, en.nav)!;
    expect(shape(model.tenant)).toEqual(["overview", ["masterData", ["materials", "locations", "customers", "suppliers", "planningParameters", "safetyStock", "boms"]], ["sales", ["forecasts"]], "stock", ["transactions", ["productionOrders", "customerOrders", "purchaseRequisitions", "purchaseOrders", "transfers"]], "tenantAudit"]);
    expect(shape(model.shared)).toEqual(["globalAudit", "help"]);
  });

  it("adds Administration (Users, Tenants) for the admin", () => {
    const model = navModel({ role: "admin" }, en.nav)!;
    expect(shape(model.shared)).toEqual([["administration", ["users", "tenantsPage"]], "globalAudit", "help"]);
    expect(model.shared[0]).toMatchObject({
      label: "Administration",
      children: [
        { id: "users", href: "/admin/users", match: "prefix", label: "Users" },
        { id: "tenantsPage", href: "/admin", match: "exact", label: "Tenants" },
      ],
    });
  });

  it("labels every entry in the reader's language and keeps where it leads", () => {
    const model = navModel({ role: "user" }, pl.nav)!;
    expect(model.tenant[0]).toEqual({ id: "overview", section: "", match: "exact", label: "Przegląd" });
    expect(model.tenant[1]).toMatchObject({
      label: "Dane podstawowe",
      children: [
        { section: "materials", label: "Materiały" },
        {},
        {},
        {},
        { section: "planning-parameters", label: "Parametry planowania" },
        { section: "safety-stock", label: "Zapas bezpieczeństwa" },
        { section: "boms", label: "BOM-y" },
      ],
    });
    expect(model.tenant[4]).toMatchObject({ label: "Transakcje", children: [{ section: "production-orders", label: "Zlecenia produkcyjne" }, {}, { section: "purchase-requisitions", label: "Zapotrzebowania zakupu" }, { section: "purchase-orders", label: "Zamówienia zakupu" }, { section: "transfers", label: "Przesunięcia" }] });
    expect(model.shared[0]).toEqual({ id: "globalAudit", href: "/admin/audit", match: "prefix", label: "Audyt globalny" });
  });
});
