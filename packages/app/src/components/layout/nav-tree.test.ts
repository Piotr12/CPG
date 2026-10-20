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
  it("hold groups with their entries", () => {
    expect(TENANT_TREE.filter(isGroup).map((group) => group.id)).toEqual(["masterData", "procurement"]);
    expect(SHARED_TREE.filter(isGroup).map((group) => [group.id, group.adminOnly])).toEqual([["administration", true]]);
  });
});

describe("trailOf", () => {
  const admin = navModel({ role: "admin" }, en.nav)!;
  const user = navModel({ role: "user" }, en.nav)!;

  it.each([
    ["/admin/test/materials", ["Master data", "Materials"]],
    ["/admin/test/materials/00000005", ["Master data", "Materials"]],
    ["/admin/test", ["Overview"]],
    ["/admin/test/audit", ["Audit"]],
    ["/admin/users", ["Administration", "Users"]],
    ["/admin", ["Administration", "Tenants"]],
    ["/admin/audit", ["Global audit"]],
    ["/admin/tokens", []],
  ] as const)("places %s at %j for the admin", (pathname, trail) => {
    expect(trailOf(admin, "test", pathname)).toEqual(trail);
  });

  it("has no place for Tenants in a normal user's sidebar", () => {
    expect(trailOf(user, "test", "/admin")).toEqual([]);
  });
});
