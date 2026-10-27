import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { navModel } from "./nav-items";
import { isCurrentLeaf, isGroup, leafHref, SHARED_TREE, TENANT_TREE, trailOf } from "./nav-tree";

describe("leafHref", () => {
  it("puts tenant entries under the targeted tenant, Overview at its root", () => {
    expect(leafHref({ id: "overview", section: "", match: "exact" }, "prod")).toBe("/admin/prod");
    expect(leafHref({ id: "materials", section: "materials", match: "prefix" }, "test")).toBe("/admin/test/materials");
  });

  it("leaves shared entries where they are", () => {
    expect(leafHref({ id: "help", href: "/help", match: "prefix" }, "prod")).toBe("/help");
  });
});

describe("isCurrentLeaf", () => {
  const overview = { id: "overview", section: "", match: "exact" } as const;
  const materials = { id: "materials", section: "materials", match: "prefix" } as const;

  it("marks Overview only on the tenant home, and a list on its record pages too", () => {
    expect(isCurrentLeaf(overview, "test", "/admin/test")).toBe(true);
    expect(isCurrentLeaf(overview, "test", "/admin/test/materials")).toBe(false);
    expect(isCurrentLeaf(materials, "test", "/admin/test/materials/00000005")).toBe(true);
  });

  it("matches only the targeted tenant", () => {
    expect(isCurrentLeaf(materials, "prod", "/admin/test/materials")).toBe(false);
  });
});

describe("the trees", () => {
  it("hold groups with their entries, Transactions above MRP, Stock and the reports (D6)", () => {
    expect(TENANT_TREE.filter(isGroup).map((group) => group.id)).toEqual(["masterData", "sales", "transactions"]);
    expect(TENANT_TREE.map((node) => node.id)).toEqual([
      "overview",
      "masterData",
      "sales",
      "transactions",
      "mrp",
      "stock",
      "stockImport",
      "stockReport",
      "varianceReport",
      "tenantAudit",
    ]);
    expect(SHARED_TREE.filter(isGroup).map((group) => [group.id, group.adminOnly])).toEqual([["administration", true]]);
  });
});

describe("trailOf", () => {
  const admin = navModel({ role: "admin" }, en.nav)!;
  const user = navModel({ role: "user" }, en.nav)!;

  it.each([
    ["/admin/test/materials", [{ label: "Master data" }, { label: "Materials" }]],
    ["/admin/test/forecasts", [{ label: "Sales" }, { label: "Forecasts" }]],
    ["/admin/test", [{ label: "Overview" }]],
    ["/admin/test/mrp", [{ label: "MRP" }]],
    ["/admin/test/audit", [{ label: "Audit" }]],
    ["/admin/users", [{ label: "Administration" }, { label: "Users" }]],
    ["/admin", [{ label: "Administration" }, { label: "Tenants" }]],
    ["/admin/audit", [{ label: "Global audit" }]],
    ["/admin/tokens", []],
  ] as const)("places %s at %j for the admin, the open page last and unlinked", (pathname, trail) => {
    expect(trailOf(admin, "test", pathname)).toEqual(trail);
  });

  it("on a detail page, links the entry to its list and ends with the record", () => {
    expect(trailOf(admin, "prod", "/admin/prod/production-orders/00000060")).toEqual([
      { label: "Transactions" },
      { label: "Production orders", href: "/admin/prod/production-orders" },
      { label: "00000060", record: true },
    ]);
    expect(trailOf(admin, "test", "/admin/test/materials/00000005")).toEqual([
      { label: "Master data" },
      { label: "Materials", href: "/admin/test/materials" },
      { label: "00000005", record: true },
    ]);
  });

  it("takes the record from the first segment under the entry, at the top level too", () => {
    expect(trailOf(admin, "test", "/admin/test/audit/00000007/history")).toEqual([
      { label: "Audit", href: "/admin/test/audit" },
      { label: "00000007", record: true },
    ]);
  });

  it("has no place for Tenants in a normal user's sidebar", () => {
    expect(trailOf(user, "test", "/admin")).toEqual([]);
  });
});
