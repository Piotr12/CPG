import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every state-changing API route is keyed (R07, spec .ai/specs/implemented/2026-10-19--1548UTC-api-idempotency.md):
// it is built with apiWrite, or tenantApiWrite under api/tenants/[tenant]/, which store the
// Idempotency-Key in the same transaction as the write. A route that resolved its own request
// scope would write outside that transaction, so write routes never call requestScope/tenantScope.
const apiDir = path.resolve(import.meta.dirname, "../packages/app/src/app/api");
const tenantDir = path.join(apiDir, "tenants", "[tenant]");
/**
 * The one global write under the tenant tree: the tenant's own metadata route, whose PATCH sets the
 * read-only flag (spec .ai/specs/2026-10-19--2018UTC-read-only-tenants.md, Q6). The flag is global
 * data, so it is keyed in the global store, and it must keep working while the tenant is read-only,
 * which tenantApiWrite would refuse. Named exactly, so the exception can't widen.
 */
const tenantMetadataRoute = path.join(tenantDir, "route.ts");
/** Whether a route's writes are tenant writes, keyed through tenantApiWrite. */
const isTenantWrite = (file: string) => file.startsWith(tenantDir + path.sep) && file !== tenantMetadataRoute;

/** Every route.ts under `dir`, recursively. */
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routes(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

const MUTATING = "POST|PUT|PATCH|DELETE";
/** Any export of a mutating method, whatever its form, `export { handler as POST }` included. */
const MUTATING_EXPORT = new RegExp(
  `export\\s+(?:const|let|var|async\\s+function|function)\\s+(${MUTATING})\\b|\\bas\\s+(${MUTATING})\\b`,
  "g",
);
/** The one accepted form: `export const METHOD = apiWrite(` (or `tenantApiWrite(`). */
const keyedExport = (wrapper: string) => new RegExp(`export\\s+const\\s+(${MUTATING})\\s*=\\s*${wrapper}\\(`, "g");
/** A read export: its code may resolve a scope. */
const READ_EXPORT = /^export\s+(?:const|let|var|async\s+function|function)\s+(?:GET|HEAD)\b/;
const OWN_SCOPE = /\b(requestScope|tenantScope|getContainer)\(/;

const read = (file: string) => readFileSync(file, "utf8");
const rel = (file: string) => path.relative(apiDir, file);
const methods = (source: string, pattern: RegExp) =>
  [...source.matchAll(pattern)].map(([, declared, aliased]) => declared ?? aliased).sort();

/**
 * A route's source without its read exports (each from its `export` to the next top-level
 * `export`). What remains, helpers included, is what a write can reach, so it may not resolve a
 * scope of its own.
 */
function writeReachable(source: string): string {
  return source
    .split(/^(?=export\s)/m)
    .filter((chunk) => !READ_EXPORT.test(chunk))
    .join("");
}

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
      .map((file) => ({ route: rel(file), unkeyed: unkeyed(read(file), isTenantWrite(file)) }))
      .filter(({ unkeyed }) => unkeyed.length > 0);
    expect(offenders).toEqual([]);
  });

  it("key only the tenant metadata route globally inside the tenant tree", () => {
    expect(writers.filter((file) => file.startsWith(tenantDir + path.sep) && !isTenantWrite(file)).map(rel)).toEqual([
      path.join("tenants", "[tenant]", "route.ts"),
    ]);
    expect(isTenantWrite(path.join(tenantDir, "materials", "route.ts"))).toBe(true);
  });

  it("never resolve their own request scope", () => {
    expect(writers.filter((file) => OWN_SCOPE.test(writeReachable(read(file)))).map(rel)).toEqual([]);
  });

  it("would notice an unkeyed or wrongly keyed write", () => {
    expect(unkeyed("export const POST = apiHandler(async () => 1);", false)).toEqual(["POST"]);
    expect(unkeyed("export async function DELETE() {}", false)).toEqual(["DELETE"]);
    expect(unkeyed("export const PATCH = apiWrite(handler);", true)).toEqual(["PATCH"]);
    expect(unkeyed("export const PUT = tenantApiWrite(handler);\nexport const GET = apiHandler(read);", true)).toEqual([]);
    expect(unkeyed("const handler = apiWrite(write);\nexport { handler as POST };", false)).toEqual(["POST"]);

    const read = "export const GET = apiHandler(async () => (await requestScope()).cradle.x.list());";
    const write = "export const POST = apiWrite(async () => (await requestScope()).cradle.x.create());";
    const helper = "const services = async () => (await getContainer()).cradle;\n";
    expect(OWN_SCOPE.test(writeReachable(read))).toBe(false);
    expect(OWN_SCOPE.test(writeReachable(`${read}\n${write}`))).toBe(true);
    expect(OWN_SCOPE.test(writeReachable(`${helper}${read}\nexport const PUT = apiWrite(handler);`))).toBe(true);
  });
});
