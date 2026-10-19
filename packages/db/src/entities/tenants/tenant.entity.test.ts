import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { Tenant, TENANT_CODES } from "./tenant.entity";

describe("Tenant", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-tenant-")), "cpg.sqlite");
  let orm: Orm;

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());

  it("exists as Test and Prod, both on generation 1, right after migrating (TEN-001)", async () => {
    const tenants = await orm.em.fork().find(Tenant, {}, { orderBy: { code: "desc" } });

    expect(TENANT_CODES).toEqual(["test", "prod"]);
    expect(tenants.map(({ code, generation }) => ({ code, generation }))).toEqual([
      { code: "test", generation: 1 },
      { code: "prod", generation: 1 },
    ]);
  });

  it("rejects any other tenant code", async () => {
    await expect(
      orm.em.getConnection().execute("insert into tenant (code, generation) values ('staging', 1)"),
    ).rejects.toThrow(/CHECK constraint failed/);
  });
});
