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
/** A `"use server"` directive, at the top of a module or inside a function (an inline action). */
const USE_SERVER = /["']use server["']/;

/**
 * What in a tenant `actions.ts` could write around the gate: each export that doesn't call
 * `tenantServerAction` (from its `export` to the next top-level `export`), plus any `tenantScope`
 * call in the file, which would open the tenant without the gate.
 */
function ungated(source: string): string[] {
  const exports = source.split(/^(?=export\s)/m).filter((chunk) => /^export\s/.test(chunk));
  const names = exports
    .filter((chunk) => !/\btenantServerAction\(/.test(chunk))
    .map((chunk) => /^export\s+(?:async\s+)?(?:function|const|let|var)\s+(\w+)/.exec(chunk)?.[1] ?? chunk.split("\n")[0]);
  return /\btenantScope\(/.test(source) ? [...names, "tenantScope()"] : names;
}

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

  it("wrap every exported tenant server action in tenantServerAction(), the read-only gate (R05)", () => {
    const offenders = named("actions.ts").flatMap((file) => ungated(read(file)).map((name) => `${rel(file)}: ${name}`));
    expect(named("actions.ts").length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("declare server actions only in actions.ts, so the gate check above sees every one", () => {
    const elsewhere = all
      .filter((file) => inTenant(file) && path.basename(file) !== "actions.ts" && USE_SERVER.test(read(file)))
      .map(rel);
    expect(elsewhere).toEqual([]);
    expect(USE_SERVER.test(`export default async function Page() {\n  async function save() {\n    "use server";\n  }\n}`)).toBe(true);
    expect(USE_SERVER.test(`'use server';\nexport async function x() {}`)).toBe(true);
    expect(USE_SERVER.test(`const note = "users serve";`)).toBe(false);
  });

  it("would notice a tenant action that skips the gate", () => {
    const gated = "export async function create(t: string) {\n  return tenantServerAction(schema, run)(t, 1, {});\n}\n";
    expect(ungated(gated)).toEqual([]);
    expect(ungated(`${gated}export async function sneak(t: string) {\n  return (await tenantScope(t)).cradle.x.write();\n}\n`)).toEqual([
      "sneak",
      "tenantScope()",
    ]);
    expect(ungated(`${gated}export const quick = async () => run();\n`)).toEqual(["quick"]);
    expect(ungated(`const helper = () => tenantScope("test");\n${gated}`)).toEqual(["tenantScope()"]);
  });

  it("are the only places that open a tenant, besides the tenant write wrapper", () => {
    const outside = all.filter((file) => !inTenant(file) && /\b(tenantScope|tenantServerAction)\(/.test(read(file)));
    // tenantApiWrite opens the path's tenant for the tenant routes that use it.
    expect(outside.map(rel)).toEqual([path.join("auth", "api-write.ts")]);
  });
});
