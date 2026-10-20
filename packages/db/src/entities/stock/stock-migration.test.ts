import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { initOrm, migrate } from "../../orm";
import { Material, Location, StockBalance, StockMovement, STOCK_MOVEMENT_IMMUTABLE, selectTenant } from "../index";
import { randomUUID } from "node:crypto";

describe("stock migration", () => {
  it("stores exact text, enforces unique pairs/sources and immutable movements, rolls back populated tables", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cpg-stock-migration-"));
    const databasePath = path.join(directory, "db.sqlite");
    await migrate({ databasePath }); const orm = await initOrm({ databasePath });
    try {
      const em = orm.em.fork(); selectTenant(em, "test");
      const material = em.create(Material, { code: "00000001", type: "raw", description: "Bolts", baseUnit: "each" });
      const location = em.create(Location, { code: "00000001", name: "Warehouse" });
      em.create(StockBalance, { material, location, quantity: "0.123456" });
      const movement = em.create(StockMovement, { material, location, postingId: randomUUID(), position: 0, type: "correction", businessDate: "2027-01-01", quantity: "0.123456", baseUnit: "each", enteredQuantity: "0.123456", enteredUnit: "each", numerator: "1", denominator: "1", balanceBefore: "0.000000", balanceAfter: "0.123456", reason: "Count", actorUserId: "u", actorUsername: "alice", channel: "ui" });
      await em.flush();
      const execute = (sql: string) => orm.em.getConnection().execute(sql);
      expect(await execute("select quantity, typeof(quantity) as kind from stock_balance")).toEqual([{ quantity: "0.123456", kind: "text" }]);
      await expect(execute("update stock_movement set reason = 'changed'")).rejects.toThrow(STOCK_MOVEMENT_IMMUTABLE);
      await expect(execute(`insert into stock_balance select 'duplicate', tenant_code, material_id, location_id, quantity, version from stock_balance`)).rejects.toThrow(/UNIQUE/);
      await expect(execute(`insert into stock_movement select 'duplicate', tenant_code, posting_id, position, type, material_id, location_id, business_date, occurred_at, quantity, base_unit, entered_quantity, entered_unit, numerator, denominator, balance_before, balance_after, reason, actor_user_id, actor_username, channel from stock_movement`)).rejects.toThrow(/UNIQUE/);
      expect(movement.id).toMatch(/^[a-f0-9-]{36}$/);
      expect(movement.occurredAt).toBeInstanceOf(Date);
      await orm.migrator.down({ to: "Migration20261020080940_boms" });
      expect(await execute("select name from sqlite_master where name like 'stock_%'")).toEqual([]);
      expect(await execute("select count(*) as n from material")).toEqual([{ n: 1 }]);
    } finally { await orm.close(); rmSync(directory, { recursive: true }); }
  });
});
