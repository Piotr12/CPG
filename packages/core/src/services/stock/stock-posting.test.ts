import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, selectTenant, Location, Material, MaterialConversion, StockMovement, TenantAuditEvent, type Orm } from "@cpg/db";
import { StockService } from "./stock.service";
import { postHistoricalInverse, postHistoricalInverses, postStockMovements } from "./stock-posting";

const actor = { userId: "u1", username: "Alice", sessionId: "s1", channel: "ui" as const, token: null };
const pair = { material: "00000001", location: "00000001" };
let orm: Orm;
let directory: string;
const scope = () => { const em = orm.em.fork(); selectTenant(em, "prod"); return em; };
const stock = () => new StockService({ em: scope() });
const correct = (quantity: string, unit = "each") => stock().correct({ ...pair, quantity, unit, reason: "Count" }, actor);
async function reverse(id: string) {
  return scope().transactional(async (em) => {
    const original = await em.findOneOrFail(StockMovement, id, { populate: ["material", "location"] });
    return postHistoricalInverse(em, original, "Entered twice", randomUUID(), actor);
  });
}
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-inverse-"));
  const databasePath = path.join(directory, "db.sqlite");
  await migrate({ databasePath }); orm = await initOrm({ databasePath });
  const em = scope();
  const material = em.create(Material, { code: pair.material, type: "raw", description: "Bolts", baseUnit: "each" });
  em.create(Location, { code: pair.location, name: "Plant" });
  em.create(MaterialConversion, { material, unit: "case", numerator: "1", denominator: "3" });
  await em.flush();
});
afterEach(async () => { vi.useRealTimers(); await orm.close(); rmSync(directory, { recursive: true }); });

describe("historical stock inverse", () => {
  it("inverts captured rounding exactly after the conversion is removed and masters are inactive", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z"), toFake: ["Date"] });
    const original = await correct("2", "case");
    const em = scope();
    await em.nativeDelete(MaterialConversion, {});
    await em.nativeUpdate(Material, { code: pair.material }, { active: false });
    await em.nativeUpdate(Location, { code: pair.location }, { active: false });
    vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
    const inverse = await reverse(original.id);
    expect(inverse).toMatchObject({ type: "reversal", quantity: "-0.666667", enteredQuantity: "-0.666667", enteredUnit: "each", numerator: "1", denominator: "1", businessDate: "2026-02-02", balanceBefore: "0.666667", balanceAfter: "0.000000" });
    expect(await scope().findOneOrFail(StockMovement, original.id)).toMatchObject({ quantity: "0.666667", enteredUnit: "case", denominator: "3", businessDate: "2026-01-01" });
    expect(await scope().count(TenantAuditEvent, { action: "stock.movement.posted" })).toBe(2);
    await expect(correct("1")).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
  });

  it("restores a negative correction using the same positive balance path", async () => {
    await correct("10"); const original = await correct("-5");
    expect(await reverse(original.id)).toMatchObject({ quantity: "5.000000", balanceBefore: "5.000000", balanceAfter: "10.000000" });
  });

  it("refuses a full inverse when only part of its stock remains", async () => {
    const original = await correct("100"); await correct("-60");
    await expect(reverse(original.id)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { available: "40.000000", requested: "100.000000" } });
    expect(await stock().get(pair)).toMatchObject({ quantity: "40.000000", movementCount: 2 });
  });

  it("preserves the existing 400 overflow refusal and writes nothing", async () => {
    await correct("999999999999.999999"); const original = await correct("-1"); await correct("1");
    await expect(reverse(original.id)).rejects.toMatchObject({ code: "QUANTITY_OUT_OF_RANGE", status: 400 });
    expect(await stock().get(pair)).toMatchObject({ quantity: "999999999999.999999", movementCount: 3 });
  });

  it.each([{ quantity: "broken" }, { quantity: "0" }, { baseUnit: "kg" }])("refuses inconsistent captured history %j", async (change) => {
    const original = await correct("5");
    const em = scope();
    const loaded = await em.findOneOrFail(StockMovement, original.id, { populate: ["material", "location"] });
    Object.assign(loaded, change);
    await expect(postHistoricalInverse(em, loaded, "Bad history", randomUUID(), actor)).rejects.toMatchObject({ code: "STOCK_REVERSAL_INCONSISTENT" });
    expect(await scope().count(StockMovement, {})).toBe(1);
  });

  it("inverts a group position for position under one posting, and one short line writes nothing", async () => {
    const em = scope();
    em.create(Material, { code: "00000002", type: "finished", description: "Panel", baseUnit: "each" });
    await em.flush();
    const output = { material: "00000002", location: pair.location };
    await correct("40");
    const [made, used] = await stock().post({ lines: [{ ...output, quantity: "10", unit: "each" }, { ...pair, quantity: "-25", unit: "each" }], reason: "Completion" }, { type: "production-completion", id: randomUUID() }, actor);
    const invert = (postingId: string) => scope().transactional(async (tx) => {
      const originals = await tx.find(StockMovement, { id: { $in: [made.id, used.id] } }, { populate: ["material", "location"], orderBy: { position: "asc" } });
      return postHistoricalInverses(tx, originals, "Entered twice", postingId, actor);
    });
    await stock().correct({ ...output, quantity: "-1", unit: "each", reason: "Scrap" }, actor);
    await expect(invert(randomUUID())).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", messageParams: { material: "00000002", available: "9.000000", requested: "10.000000" } });
    expect(await scope().count(StockMovement, { type: "reversal" })).toBe(0);
    expect(await stock().get(pair)).toMatchObject({ quantity: "15.000000" });
    await stock().correct({ ...output, quantity: "1", unit: "each", reason: "Found" }, actor);
    const postingId = randomUUID();
    const inverses = await invert(postingId);
    expect(inverses).toMatchObject([
      { postingId, position: 0, type: "reversal", material: "00000002", quantity: "-10.000000", balanceAfter: "0.000000" },
      { postingId, position: 1, type: "reversal", material: "00000001", quantity: "25.000000", balanceAfter: "40.000000" },
    ]);
  });
});

describe("posting context dates", () => {
  const lines = [{ ...pair, quantity: "4", unit: "each" }];
  const post = (context: Parameters<typeof postStockMovements>[3]) =>
    scope().transactional((em) => postStockMovements(em, { lines, reason: "Count" }, { type: "correction", id: randomUUID() }, context));

  it("dates a user posting today, occurred now, and audits it", async () => {
    vi.useFakeTimers({ now: new Date("2026-03-04T05:06:07Z"), toFake: ["Date"] });
    const [movement] = await post({ kind: "user", actor });
    expect(movement).toMatchObject({ businessDate: "2026-03-04", channel: "ui" });
    expect(movement.occurredAt.toISOString()).toBe("2026-03-04T05:06:07.000Z");
    expect(await scope().count(TenantAuditEvent, { action: "stock.movement.posted" })).toBe(1);
  });

  it("dates a seed posting from its own moment and writes no audit", async () => {
    const at = new Date("2025-11-30T23:59:58Z");
    const [movement] = await post({ kind: "seed", at });
    expect(movement).toMatchObject({ businessDate: "2025-11-30", channel: "seed", actorUsername: "Demo seed", balanceAfter: "4.000000" });
    expect(movement.occurredAt.toISOString()).toBe(at.toISOString());
    expect((await scope().findOneOrFail(StockMovement, movement.id)).occurredAt.toISOString()).toBe(at.toISOString());
    expect(await scope().count(TenantAuditEvent, { action: "stock.movement.posted" })).toBe(0);
  });
});
