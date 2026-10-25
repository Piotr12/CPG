import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initOrm, migrate, type EntityManager, type Orm } from "../../orm";
import { resetTestData } from "../../tenants/reset-test-data";
import { Location } from "../locations/location.entity";
import { Material } from "../materials/material.entity";
import { selectTenant, TenantViolationError } from "../tenants/tenant-owned";
import { Transfer } from "./transfer.entity";
import { TransferPosting } from "./transfer-posting.entity";
import { TransferReversal, TRANSFER_REVERSAL_IMMUTABLE } from "./transfer-reversal.entity";

let orm: Orm;
let directory: string;
const scope = (code: "test" | "prod" = "test") => { const em = orm.em.fork(); selectTenant(em, code); return em; };
async function fixture(em: EntityManager) {
  const material = em.create(Material, { code: "00000001", type: "raw", description: "Flour", baseUnit: "kg" });
  const source = em.create(Location, { code: "00000001", name: "Plant" });
  const destination = em.create(Location, { code: "00000002", name: "Depot" });
  const transfer = em.create(Transfer, {
    code: "00000001", material, source, destination, quantity: "100.000000", enteredQuantity: "100", enteredUnit: "kg",
    numerator: "1", denominator: "1", plannedDispatch: "2026-10-21", plannedArrival: "2026-10-23",
  });
  const posting = em.create(TransferPosting, {
    transfer, kind: "write-off", businessDate: "2026-10-21", quantity: "5.000000", enteredQuantity: "5", enteredUnit: "kg",
    numerator: "1", denominator: "1", transitBefore: "5.000000", transitAfter: "0.000000", reason: "Lost", actorUserId: null, actorUsername: "admin", channel: "ui",
  });
  const reversal = em.create(TransferReversal, {
    id: randomUUID(), transfer, original: posting, businessDate: "2026-10-22", quantity: "5.000000",
    transitBefore: "0.000000", transitAfter: "5.000000", reason: "Found", actorUserId: "u1", actorUsername: "alice", channel: "api",
  });
  await em.flush();
  return { transfer, posting, reversal };
}
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-transfer-reversal-db-"));
  const databasePath = path.join(directory, "db.sqlite");
  await migrate({ databasePath });
  orm = await initOrm({ databasePath });
});
afterEach(async () => { await orm.close(); rmSync(directory, { recursive: true }); });

describe("TransferReversal persistence", () => {
  it("stamps its time, refuses updates and allows one reversal per original posting", async () => {
    const em = scope();
    const { posting, reversal } = await fixture(em);
    expect(reversal.occurredAt).toBeInstanceOf(Date);
    expect(await em.findOneOrFail(TransferReversal, { original: posting })).toMatchObject({ id: reversal.id, quantity: "5.000000", channel: "api" });
    const sql = orm.em.getConnection();
    await expect(sql.execute("update transfer_reversal set reason = 'Edited' where id = ?", [reversal.id])).rejects.toThrow(TRANSFER_REVERSAL_IMMUTABLE);
    await expect(sql.execute(`insert into transfer_reversal (id, tenant_code, transfer_id, original_id, business_date, occurred_at, quantity, transit_before, transit_after, reason, actor_username, channel)
      select ?, tenant_code, transfer_id, original_id, business_date, occurred_at, quantity, transit_before, transit_after, reason, actor_username, channel from transfer_reversal`, [randomUUID()])).rejects.toThrow(/UNIQUE/);
    expect(await em.count(TransferReversal, {})).toBe(1);
  });

  it("isolates reads and rejects a reversal of another tenant's posting", async () => {
    const test = scope();
    const { transfer, reversal } = await fixture(test);
    const other = await fixture(scope("prod"));
    expect(await scope("prod").findOne(TransferReversal, reversal.id)).toBeNull();
    test.create(TransferReversal, { ...reversal, id: randomUUID(), transfer, original: other.posting });
    await expect(test.flush()).rejects.toThrow(TenantViolationError);
    expect(await scope("prod").count(TransferReversal, {})).toBe(1);
  });

  it("resets Test reversals with their postings while keeping Prod", async () => {
    await fixture(scope()); await fixture(scope("prod"));
    const em = scope();
    await em.begin(); await resetTestData(em); await em.commit();
    expect([await em.count(TransferReversal, {}), await em.count(TransferPosting, {})]).toEqual([0, 0]);
    expect(await scope("prod").count(TransferReversal, {})).toBe(1);
    expect(await orm.em.getConnection().execute("pragma foreign_key_check")).toEqual([]);
  });

  it("rolls down without touching postings and upgrades a populated previous schema", async () => {
    const { posting } = await fixture(scope());
    await orm.migrator.down(); // List sort indexes.
    await orm.migrator.down(); // Shipment edit and cancel.
    await orm.migrator.down(); // Location guard indexes.
    await orm.migrator.down();
    expect(await orm.em.getConnection().execute("select name from sqlite_master where name like 'transfer_reversal%'")).toEqual([]);
    expect(await scope().count(TransferPosting, {})).toBe(1);
    await orm.migrator.up();
    expect(await scope().findOne(TransferPosting, posting.id)).not.toBeNull();
    expect(await scope().count(TransferReversal, {})).toBe(0);
    expect(await orm.schema.getUpdateSchemaSQL()).not.toContain("transfer_reversal");
  });
});
