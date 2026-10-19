import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// The ESLint half of tenant isolation (eslint.config.mjs, `tenantRules`): proves each rule fires
// where it should and stays quiet where it's allowed, so a config edit can't silently drop one.
const repoRoot = path.resolve(import.meta.dirname, "..");
const eslint = new ESLint({ cwd: repoRoot });

async function restrictedSyntax(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });
  return result.messages.filter(({ ruleId }) => ruleId === "no-restricted-syntax").map(({ message }) => message);
}

const SERVICE = "packages/core/src/services/example/example.service.ts";

describe("tenant lint rules", () => {
  it.each([
    ["a filters option", "await em.find(X, {}, { filters: false });", /Never pass `filters`/],
    ["setFilterParams", 'em.setFilterParams("tenant", { code: "prod" });', /Only tenantScope\(\) selects the tenant/],
    ["selectTenant", 'selectTenant(em, "prod");', /Only tenantScope\(\) selects the tenant/],
    ["raw SQL", 'await em.getConnection().execute("select 1");', /No raw SQL/],
    ["Kysely", "em.getKysely();", /No raw SQL/],
  ])("rejects %s in core and app source", async (_name, code, message) => {
    expect(await restrictedSyntax(code, SERVICE)).toEqual([expect.stringMatching(message)]);
    expect(await restrictedSyntax(code, "packages/app/src/app/admin/actions.ts")).toEqual([
      expect.stringMatching(message),
    ]);
  });

  it("allows selectTenant only in tenantScope and raw SQL only in the health check", async () => {
    expect(await restrictedSyntax('selectTenant(em, "test");', "packages/core/src/container/tenant-scope.ts")).toEqual([]);
    expect(
      await restrictedSyntax('await em.getConnection().execute("select 1");', "packages/core/src/services/system/system-status.service.ts"),
    ).toEqual([]);
    expect(await restrictedSyntax('em.setFilterParams("tenant", {});', "packages/core/src/container/tenant-scope.ts")).toHaveLength(1);
  });

  it("leaves tests and other packages alone", async () => {
    expect(await restrictedSyntax("await em.find(X, {}, { filters: false });", "packages/core/src/services/example/example.service.test.ts")).toEqual([]);
    expect(await restrictedSyntax('await em.getConnection().execute("select 1");', "packages/db/src/orm.ts")).toEqual([]);
  });
});
