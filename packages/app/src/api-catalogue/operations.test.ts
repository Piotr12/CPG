import { describe, expect, it } from "vitest";
import { API_METHODS, API_OPERATIONS } from "./operations";

const ID = /^[a-z]+(?:-[a-z]+)*(?:\.[a-z]+(?:-[a-z]+)*)+$/;
const PATH = /^\/api(?:\/(?:[a-z]+(?:-[a-z]+)*|\{[a-zA-Z]+\}))+$/;

describe("API_OPERATIONS", () => {
  it("describes every route handler of today: 116, plus GET /api/me", () => {
    expect(API_OPERATIONS).toHaveLength(117);
  });

  it("has unique, dotted concept.action ids", () => {
    const ids = API_OPERATIONS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => !ID.test(id))).toEqual([]);
  });

  it("has one entry per method and path, each path written with {param} segments", () => {
    const routes = API_OPERATIONS.map(({ method, path }) => `${method} ${path}`);
    expect(new Set(routes).size).toBe(routes.length);
    expect(API_OPERATIONS.filter(({ path }) => !PATH.test(path)).map(({ id }) => id)).toEqual([]);
    expect(API_OPERATIONS.every(({ method }) => API_METHODS.includes(method))).toBe(true);
  });

  it("reads with GET and nothing else, so a write always carries a key", () => {
    const inconsistent = API_OPERATIONS.filter(({ method, write }) => (method === "GET") !== (write === null));
    expect(inconsistent.map(({ id }) => id)).toEqual([]);
  });

  it("puts tenant writes under a tenant and global writes outside one, except the tenant's own flag", () => {
    const misplaced = API_OPERATIONS.filter(({ id, path, write }) => {
      if (write === "tenant") return !path.startsWith("/api/tenants/");
      return write === "global" && path.startsWith("/api/tenants/{tenant}") && id !== "tenants.set-read-only";
    });
    expect(misplaced.map(({ id }) => id)).toEqual([]);
  });

  it("takes a query only on reads and a body only on writes", () => {
    expect(API_OPERATIONS.filter(({ write, query }) => write !== null && query).map(({ id }) => id)).toEqual([]);
    expect(API_OPERATIONS.filter(({ write, body }) => write === null && body).map(({ id }) => id)).toEqual([]);
  });

  it("gives every operation a one-sentence summary", () => {
    expect(API_OPERATIONS.filter(({ summary }) => !/^[A-Z].*\.$/.test(summary) || summary.length > 160).map(({ id }) => id)).toEqual([]);
  });

  it("keeps the admin's operations to master data, imports, users, the read-only flag and the Test reset", () => {
    const admin = API_OPERATIONS.filter(({ role }) => role === "admin").map(({ id }) => id.split(".")[0]);
    expect([...new Set(admin)].sort()).toEqual([
      "boms",
      "customers",
      "forecasts",
      "import",
      "locations",
      "material-conversions",
      "materials",
      "planning-parameters",
      "safety-stock-targets",
      "suppliers",
      "tenants",
      "users",
    ]);
  });
});
