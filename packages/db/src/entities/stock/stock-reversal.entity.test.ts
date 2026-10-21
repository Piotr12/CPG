import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initOrm, migrate, type EntityManager, type Orm } from "../../orm";
import { selectTenant, TenantViolationError } from "../tenants/tenant-owned";
import { resetTestData } from "../../tenants/reset-test-data";
import { Material } from "../materials/material.entity";
import { Location } from "../locations/location.entity";
import { StockMovement } from "./stock-movement.entity";
import { StockReversal, STOCK_REVERSAL_IMMUTABLE } from "./stock-reversal.entity";

let orm: Orm;
let directory: string;
const scope = (code: "test" | "prod" = "test") => { const em = orm.em.fork(); selectTenant(em, code); return em; };
async function fixture(em: EntityManager) {
  const material = em.create(Material, { code: "00000001", description: "Bolts", baseUnit: "each", type: "raw" });
  const location = em.create(Location, { code: "00000001", name: "Warehouse" });
  const movement = (quantity: string) => em.create(StockMovement, {
    postingId: randomUUID(), position: 0, type: "correction", material, location, businessDate: "2026-10-21",
    quantity, baseUnit: "each", enteredQuantity: quantity, enteredUnit: "each", numerator: "1", denominator: "1",
    balanceBefore: "0.000000", balanceAfter: "5.000000", reason: "Fixture", actorUsername: "Tester", channel: "ui",
  });
  const original = movement("5.000000");
  const inverse = movement("-5.000000");
  const link = em.create(StockReversal, { original, inverse });
  await em.flush();
  return { original, inverse, link };
}
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-reversal-db-"));
  const databasePath = path.join(directory, "db.sqlite");
  await migrate({ databasePath });
  orm = await initOrm({ databasePath });
});
afterEach(async () => { await orm.close(); rmSync(directory, { recursive: true }); });

describe("StockReversal persistence", () => {
  it("generates an immutable link and enforces one original and one inverse", async () => {
    const em = scope();
    const { original, inverse, link } = await fixture(em);
    expect(link.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(await em.findOneOrFail(StockReversal, { original })).toMatchObject({ id: link.id, inverse: { id: inverse.id } });
    const sql = orm.em.getConnection();
    await expect(sql.execute("update stock_reversal set original_id = ? where id = ?", [inverse.id, link.id])).rejects.toThrow(STOCK_REVERSAL_IMMUTABLE);
    for (const [first, second] of [[original.id, original.id], [inverse.id, inverse.id]]) {
      await expect(sql.execute("insert into stock_reversal (id, tenant_code, original_id, inverse_id) values (?, 'test', ?, ?)", [randomUUID(), first, second])).rejects.toThrow(/UNIQUE/);
    }
    expect(await em.count(StockReversal, {})).toBe(1);
  });

  it("isolates reads and rejects a cross-tenant reference", async () => {
    const test = scope();
    const prod = scope("prod");
    const { original, link } = await fixture(test);
    const other = await fixture(prod);
    expect(await prod.findOne(StockReversal, link.id)).toBeNull();
    test.create(StockReversal, { original: other.original, inverse: original });
    await expect(test.flush()).rejects.toThrow(TenantViolationError);
    expect(await scope("prod").count(StockReversal, {})).toBe(1);
  });

  it("resets Test links and movements together while keeping Prod", async () => {
    await fixture(scope()); await fixture(scope("prod"));
    const em = scope();
    await em.begin(); await resetTestData(em); await em.commit();
    expect(await em.count(StockReversal, {})).toBe(0);
    expect(await em.count(StockMovement, {})).toBe(0);
    expect(await scope("prod").count(StockReversal, {})).toBe(1);
    expect(await orm.em.getConnection().execute("pragma foreign_key_check")).toEqual([]);
  });

  it("rolls down links without deleting movements and upgrades a populated previous schema", async () => {
    const { original } = await fixture(scope());
    await orm.migrator.down();
    expect(await orm.em.getConnection().execute("select name from sqlite_master where name like 'stock_reversal%'")).toEqual([]);
    expect(await scope().count(StockMovement, {})).toBe(2);
    await orm.migrator.up();
    expect(await scope().findOne(StockMovement, original.id)).not.toBeNull();
    expect(await scope().count(StockReversal, {})).toBe(0);
    expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("stock_reversal");
  });
});
