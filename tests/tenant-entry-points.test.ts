import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Tenant data is reached only through tenantScope, and only from the tenant entry points (spec
// .ai/specs/2026-10-19--0913UTC-test-prod-tenants.md): pages and actions under app/admin/[tenant]/,
// route handlers under app/api/tenants/[tenant]/. Everywhere else is global.
const appDir = path.resolve(import.meta.dirname, "../packages/app/src");
const tenantRoots = ["app/admin/[tenant]", "app/api/tenants/[tenant]"].map((dir) => path.join(appDir, dir));

/** Every non-test source file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const all = sources(appDir);
const inTenant = (file: string) => tenantRoots.some((root) => file.startsWith(root + path.sep));
const named = (name: string) => all.filter((file) => inTenant(file) && path.basename(file) === name);
const rel = (file: string) => path.relative(appDir, file);
const read = (file: string) => readFileSync(file, "utf8");

describe("tenant entry points", () => {
  it("include the tenant home page and the tenant metadata route", () => {
    expect(named("page.tsx").map(rel)).toContain(path.join("app", "admin", "[tenant]", "page.tsx"));
    expect(named("route.ts").map(rel)).toContain(path.join("app", "api", "tenants", "[tenant]", "route.ts"));
  });

  it("read tenant pages and route handlers through tenantScope(), or write through tenantApiWrite()", () => {
    const missing = [...named("page.tsx"), ...named("route.ts")].filter(
      (file) => !/\b(tenantScope|tenantApiWrite)\(/.test(read(file)),
    );
    expect(missing.map(rel)).toEqual([]);
  });

  it("wrap tenant server actions in tenantServerAction()", () => {
    const missing = named("actions.ts").filter((file) => !/\btenantServerAction\(/.test(read(file)));
    expect(missing.map(rel)).toEqual([]);
  });

  it("are the only places that open a tenant, besides the tenant write wrapper", () => {
    const outside = all.filter((file) => !inTenant(file) && /\b(tenantScope|tenantServerAction)\(/.test(read(file)));
    // tenantApiWrite opens the path's tenant for the tenant routes that use it.
    expect(outside.map(rel)).toEqual([path.join("auth", "api-write.ts")]);
  });
});
