import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The audit is append-only (spec .ai/specs/2026-10-19--1050UTC-audit-log.md, AUD-010). The real
// guard is the database: triggers abort every UPDATE and DELETE on both audit tables
// (packages/db/src/entities/audit/audit.entity.test.ts). This is a best-effort source scan on top,
// so that a write path never gets as far as the database: it can't see every path.
const packages = path.resolve(import.meta.dirname, "../packages");
const auditRoutes = ["app/src/app/api/audit/route.ts", "app/src/app/api/tenants/[tenant]/audit/route.ts"];

/** Every non-test source file under `dir`, recursively. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const read = (file: string) => readFileSync(file, "utf8");
const HTTP_METHOD_EXPORT = /export\s+(?:const|async\s+function|function)\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/g;
const MUTATION = /\b(nativeUpdate|nativeDelete|upsert|upsertMany|insert|insertMany|assign|remove)\s*\(/;

describe("audit append-only", () => {
  it("exposes only GET on the audit routes", () => {
    for (const route of auditRoutes) {
      const methods = [...read(path.join(packages, route)).matchAll(HTTP_METHOD_EXPORT)].map(([, method]) => method);
      expect({ route, methods }).toEqual({ route, methods: ["GET"] });
    }
  });

  it("has no core or app code that changes or removes an audit entry", () => {
    const offenders = [...sources(path.join(packages, "core/src")), ...sources(path.join(packages, "app/src"))]
      .filter((file) => /\b(GlobalAuditEvent|TenantAuditEvent)\b/.test(read(file)) && MUTATION.test(read(file)))
      .map((file) => path.relative(packages, file));

    expect(offenders).toEqual([]);
  });

  it("would notice a mutation next to an audit entity", () => {
    expect(MUTATION.test("em.nativeDelete(GlobalAuditEvent, {})")).toBe(true);
    expect(MUTATION.test("em.create(GlobalAuditEvent, entry)")).toBe(false);
    expect([..."export const POST = handler;".matchAll(HTTP_METHOD_EXPORT)].map(([, m]) => m)).toEqual(["POST"]);
  });
});
