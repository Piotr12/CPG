import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every state-changing API route is keyed (R07, spec .ai/specs/2026-10-19--1548UTC-api-idempotency.md):
// it is built with apiWrite, or tenantApiWrite under api/tenants/[tenant]/, which store the
// Idempotency-Key in the same transaction as the write. A route that resolved its own request
// scope would write outside that transaction, so write routes never call requestScope/tenantScope.
const apiDir = path.resolve(import.meta.dirname, "../packages/app/src/app/api");
const tenantDir = path.join(apiDir, "tenants", "[tenant]");

/** Every route.ts under `dir`, recursively. */
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routes(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

const MUTATING = "POST|PUT|PATCH|DELETE";
/** Any export of a mutating method, whatever its form. */
const MUTATING_EXPORT = new RegExp(`export\\s+(?:const|let|var|async\\s+function|function)\\s+(${MUTATING})\\b`, "g");
/** The one accepted form: `export const METHOD = apiWrite(` (or `tenantApiWrite(`). */
const keyedExport = (wrapper: string) => new RegExp(`export\\s+const\\s+(${MUTATING})\\s*=\\s*${wrapper}\\(`, "g");
const OWN_SCOPE = /\b(requestScope|tenantScope)\(/;

const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => path.relative(apiDir, file);
const methods = (source: string, pattern: RegExp) => [...source.matchAll(pattern)].map(([, method]) => method).sort();

/** The mutating exports of a route source that aren't built with the expected wrapper. */
function unkeyed(source: string, tenant: boolean): string[] {
  const keyed = methods(source, keyedExport(tenant ? "tenantApiWrite" : "apiWrite"));
  return methods(source, MUTATING_EXPORT).filter((method) => !keyed.includes(method));
}

describe("API write routes", () => {
  const all = routes(apiDir);
  const writers = all.filter((file) => methods(read(file), MUTATING_EXPORT).length > 0);

  it("include the token revoke route", () => {
    expect(writers.map(rel)).toContain(path.join("tokens", "[id]", "route.ts"));
  });

  it("are all keyed through apiWrite, or tenantApiWrite in a tenant", () => {
    const offenders = writers
      .map((file) => ({ route: rel(file), unkeyed: unkeyed(read(file), file.startsWith(tenantDir + path.sep)) }))
      .filter(({ unkeyed }) => unkeyed.length > 0);
    expect(offenders).toEqual([]);
  });

  it("never resolve their own request scope", () => {
    expect(writers.filter((file) => OWN_SCOPE.test(read(file))).map(rel)).toEqual([]);
  });

  it("would notice an unkeyed or wrongly keyed write", () => {
    expect(unkeyed("export const POST = apiHandler(async () => 1);", false)).toEqual(["POST"]);
    expect(unkeyed("export async function DELETE() {}", false)).toEqual(["DELETE"]);
    expect(unkeyed("export const PATCH = apiWrite(handler);", true)).toEqual(["PATCH"]);
    expect(unkeyed("export const PUT = tenantApiWrite(handler);\nexport const GET = apiHandler(read);", true)).toEqual([]);
    expect(OWN_SCOPE.test("const { cradle } = await requestScope();")).toBe(true);
  });
});
