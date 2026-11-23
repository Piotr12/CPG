import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { API_OPERATIONS, type ApiOperation, type OperationRole, type OperationWrite } from "../packages/app/src/api-catalogue/operations";

// The operation registry describes every API route handler (spec .ai/specs/2026-11-22--0818UTC-local-mcp-server.md,
// step 3), and the MCP server builds its tools from it. This walks the route files as tests/api-writes.test.ts does
// and fails when the two disagree, so API parity (R07) can't decay silently. Known limit: a named schema is proven
// to be on the request's path, not to be its only parse.
const root = path.resolve(import.meta.dirname, "..");
const apiDir = path.join(root, "packages/app/src/app/api");
const servicesDir = path.join(root, "packages/core/src/services");
const validatorsDir = path.join(root, "packages/core/src/validators");

/** Every file under `dir` whose name passes `keep`, recursively. */
function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full, keep);
    return keep(entry.name) ? [full] : [];
  });
}

const read = (file: string) => readFileSync(file, "utf8");

/** `packages/app/src/app/api/tenants/[tenant]/boms/route.ts` → `/api/tenants/{tenant}/boms`. */
function apiPathOf(file: string): string {
  const segments = path.relative(apiDir, path.dirname(file)).split(path.sep).filter(Boolean);
  return ["/api", ...segments.map((segment) => segment.replace(/^\[(\w+)\]$/, "{$1}"))].join("/");
}

const METHOD = "GET|POST|PATCH|PUT|DELETE";
const EXPORT = new RegExp(`^export\\s+(?:const|async\\s+function|function)\\s+(${METHOD})\\b`);
/** Method exports this walk can't read: `export { handler as POST }`, `export let GET`. Routes must not use them. */
const UNREADABLE_EXPORT = new RegExp(`export\\s*\\{[^}]*\\bas\\s+(?:${METHOD})\\b|export\\s+(?:let|var)\\s+(?:${METHOD})\\b`);

/** A source without its comments, so a doc comment never reads as code. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Each exported method of a route source, with its code: its own top-level statement plus the file's helpers
 * (every other top-level statement but imports and exports), which any handler may call.
 */
function handlers(source: string): { method: string; code: string }[] {
  const statements = withoutComments(source).split(/^(?=[A-Za-z])/m);
  const helpers = statements.filter((statement) => !/^(?:import|export)\b/.test(statement)).join("");
  return statements.flatMap((statement) => {
    const method = statement.match(EXPORT)?.[1];
    return method ? [{ method, code: statement + helpers }] : [];
  });
}

const WRAPPERS: Record<string, OperationWrite> = { apiWrite: "global", tenantApiWrite: "tenant", testResetApiWrite: "tenant" };

/** The write contract a handler's wrapper enforces, or null for a read. */
function writeOf(code: string): OperationWrite {
  const wrapper = code.match(/^export\s+const\s+\w+\s*=\s*(\w+)\(/)?.[1];
  return wrapper !== undefined && wrapper in WRAPPERS ? WRAPPERS[wrapper] : null;
}

/** `admin` when the handler checks `assertAdmin`, itself or through the Test reset's wrapper. */
function roleOf(code: string): OperationRole {
  return /authorize:\s*assertAdmin\b|\bassertAdmin\(|=\s*testResetApiWrite\(/.test(code) ? "admin" : "any";
}

/** The schemas a handler parses its body or query string with, by name. */
function parsedSchemas(code: string): string[] {
  return [...code.matchAll(/parseInput\(\s*(\w+)\s*,\s*(?:body|Object\.fromEntries)\b/g)].map(([, name]) => name);
}

/** The core service files a handler calls into, found by the cradle key (`stockReportService` → `stock-report.service.ts`). */
function serviceFilesOf(code: string): string[] {
  const names = [...code.matchAll(/cradle\.(\w+)Service\./g)].map(([, key]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}.service.ts`);
  return files(servicesDir, (name) => names.includes(name));
}

const mentions = (source: string, name: string) => new RegExp(`\\b${name}\\b`).test(source);

interface Handler {
  route: string;
  method: string;
  path: string;
  code: string;
  source: string;
}

const routeHandlers: Handler[] = files(apiDir, (name) => name === "route.ts").flatMap((file) => {
  const source = read(file);
  return handlers(source).map(({ method, code }) => ({ route: path.relative(apiDir, file), method, path: apiPathOf(file), code, source }));
});
const key = ({ method, path }: { method: string; path: string }) => `${method} ${path}`;
const entries = new Map(API_OPERATIONS.map((operation) => [key(operation), operation]));

/** Each validator schema's exported names, by identity, so a registry entry's schema can be found by name in a route. */
const schemaNames = new Map<unknown, string[]>();
beforeAll(async () => {
  for (const file of files(validatorsDir, (name) => name.endsWith(".schema.ts"))) {
    for (const [name, value] of Object.entries(await import(file))) schemaNames.set(value, [...(schemaNames.get(value) ?? []), name]);
  }
});

const namesOf = (schema: unknown) => schemaNames.get(schema) ?? [];
const entryOf = (handler: Handler) => entries.get(key(handler)) as ApiOperation;
/** The handlers with an entry: the first check reports the others. */
const described = () => routeHandlers.filter((handler) => entries.has(key(handler)));

describe("the API operation registry", () => {
  it("finds the route handlers it walks", () => {
    expect(routeHandlers).toHaveLength(117);
    expect(routeHandlers.map(key)).toContain("GET /api/me");
  });

  it("has an entry for every exported route method, and a route for every entry", () => {
    const handled = new Set(routeHandlers.map(key));
    expect(routeHandlers.filter((handler) => !entries.has(key(handler))).map(key)).toEqual([]);
    expect(API_OPERATIONS.filter((operation) => !handled.has(key(operation))).map(({ id }) => id)).toEqual([]);
  });

  it("states each handler's write contract as its wrapper enforces it", () => {
    const wrong = described().filter((handler) => writeOf(handler.code) !== entryOf(handler).write);
    expect(wrong.map(key)).toEqual([]);
  });

  it("marks admin exactly the handlers that check assertAdmin", () => {
    const wrong = described().filter((handler) => roleOf(handler.code) !== entryOf(handler).role);
    expect(wrong.map(key)).toEqual([]);
  });

  it("exports every route method in a form this walk reads", () => {
    const sources = files(apiDir, (name) => name === "route.ts").filter((file) => UNREADABLE_EXPORT.test(withoutComments(read(file))));
    expect(sources.map((file) => path.relative(apiDir, file))).toEqual([]);
  });

  it("gives a query schema to every handler that reads the query string, and a body schema to every write that reads the body", () => {
    const missing = described().flatMap((handler) => {
      const { body, query } = entryOf(handler);
      return [
        ...(/\bsearchParams\b/.test(handler.code) && !query ? [`${key(handler)}: query`] : []),
        ...(/\bbody\b/.test(handler.code) && !body ? [`${key(handler)}: body`] : []),
      ];
    });
    expect(missing).toEqual([]);
  });

  it("names every schema a handler parses its body or query with", () => {
    const missing = described().flatMap((handler) => {
      const { body, query } = entryOf(handler);
      const named = [...namesOf(body), ...namesOf(query)];
      return parsedSchemas(handler.code).filter((name) => !named.includes(name)).map((name) => `${key(handler)}: ${name}`);
    });
    expect(missing).toEqual([]);
  });

  it("names only schemas the route file, or a service it calls, uses", () => {
    const strays = described().flatMap((handler) => {
      const { body, query } = entryOf(handler);
      const sources = [handler.source, ...serviceFilesOf(handler.code).map(read)];
      return [body, query]
        .filter((schema) => schema !== undefined)
        .filter((schema) => !namesOf(schema).some((name) => sources.some((source) => mentions(source, name))))
        .map((schema) => `${key(handler)}: ${namesOf(schema).join("/") || "an unexported schema"}`);
    });
    expect(strays).toEqual([]);
  });

  it("would notice a misdescribed handler", () => {
    expect(apiPathOf(path.join(apiDir, "tenants", "[tenant]", "boms", "[id]", "route.ts"))).toBe("/api/tenants/{tenant}/boms/{id}");
    const source = [
      'import { x } from "y";',
      "export const GET = apiHandler(async (request) => parseInput(listSchema, Object.fromEntries(new URL(request.url).searchParams)));",
      "export const PATCH = tenantApiWrite(async ({ body }) => parseInput(updateSchema, body), { authorize: assertAdmin });",
      "export async function DELETE() {}",
    ].join("\n");
    const [get, patch, remove] = handlers(source);
    expect([get.method, patch.method, remove.method]).toEqual(["GET", "PATCH", "DELETE"]);
    expect([writeOf(get.code), writeOf(patch.code), writeOf(remove.code)]).toEqual([null, "tenant", null]);
    expect([roleOf(get.code), roleOf(patch.code)]).toEqual(["any", "admin"]);
    expect(writeOf("export const POST = apiWrite(handler);")).toBe("global");
    expect(roleOf("export const GET = apiHandler(async (r) => { assertAdmin(await requireApiUser(r)); });")).toBe("admin");
    expect(roleOf("export const POST = testResetApiWrite(handler);")).toBe("admin");
    expect([...parsedSchemas(get.code), ...parsedSchemas(patch.code)]).toEqual(["listSchema", "updateSchema"]);
    expect(parsedSchemas("parseInput(tenantCodeSchema, (await params).tenant)")).toEqual([]);

    const helped = handlers(
      [
        "/** Admin only: assertAdmin( in a comment is not code. */",
        "const check = apiHandler(async (r) => assertAdmin(await requireApiUser(r)));",
        "export async function GET(request) { return check(request); }",
        "// export const POST = apiWrite(x);",
        "export const PUT = apiWrite(async ({ caller }) => caller);",
        "function keyOf() {}",
      ].join("\n"),
    );
    expect(helped.map(({ method }) => method)).toEqual(["GET", "PUT"]);
    expect(roleOf(helped[0].code)).toBe("admin");
    expect(helped[1].code).toContain("function keyOf()");
    expect(UNREADABLE_EXPORT.test("const h = apiWrite(x);\nexport { h as POST };")).toBe(true);
    expect(UNREADABLE_EXPORT.test("export let GET = apiHandler(x);")).toBe(true);
    expect(UNREADABLE_EXPORT.test("export const GET = apiHandler(x);")).toBe(false);
  });
});
