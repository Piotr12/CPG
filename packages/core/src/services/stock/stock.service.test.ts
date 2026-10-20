import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, selectTenant, Location, Material, MaterialConversion, StockBalance, StockMovement, Tenant, TenantAuditEvent, type Orm, type TenantCode } from "@cpg/db";
import type { AuditActor } from "../audit/actor";
import { StockService } from "./stock.service";
import { MaterialService } from "../materials/material.service";
import { LocationService } from "../locations/location.service";
import { inRequestTransaction, retryingStaleSnapshot } from "../../http/request-transaction";

const ACTOR: AuditActor = { userId: "u1", username: "alice", sessionId: "session1", channel: "ui", token: null };
const PAIR = { material: "00000001", location: "00000001" };
const line = (quantity = "2", extra = {}) => ({ ...PAIR, quantity, unit: "each", reason: "Opening balance", ...extra });
let orm: Orm;
let directory: string;
function scoped(tenant: TenantCode = "prod", connection = orm) {
  const em = connection.em.fork(); selectTenant(em, tenant); return em;
}
const service = (tenant: TenantCode = "prod") => new StockService({ em: scoped(tenant) });
const entries = () => scoped().find(TenantAuditEvent, { action: "stock.movement.posted" });
async function masters(tenant: TenantCode = "prod") {
  const em = scoped(tenant);
  const material = em.create(Material, { code: "00000001", type: "raw", description: "Bolts", baseUnit: "each" });
  em.create(Material, { code: "00000002", type: "raw", description: "Inactive", baseUnit: "each", active: false });
  em.create(Location, { code: "00000001", name: "Warehouse" });
  em.create(Location, { code: "00000002", name: "Inactive", active: false });
  em.create(MaterialConversion, { material, unit: "case", numerator: "12", denominator: "1" });
  await em.flush();
}
beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "cpg-stock-"));
  const databasePath = path.join(directory, "db.sqlite");
  await migrate({ databasePath }); orm = await initOrm({ databasePath }); await masters();
});
afterEach(async () => { vi.restoreAllMocks(); await orm.close(); rmSync(directory, { recursive: true }); });

describe("StockService", () => {
  it("reads a missing balance as exact zero without creating rows (INV-001)", async () => {
    expect(await service().get(PAIR)).toMatchObject({ ...PAIR, quantity: "0.000000", baseUnit: "each", movements: [] });
    expect(await scoped().count(StockBalance, {})).toBe(0);
  });
  it("posts a reasoned opening with source, today UTC, entered unit and an atomic audit (INV-013/016/023)", async () => {
    vi.useFakeTimers({ now: new Date("2027-01-05T23:59:00Z"), toFake: ["Date"] });
    try {
      const posted = await service().correct(line("+2", { unit: "case", reason: " Opening balance ", date: "1900-01-01", actorUserId: "fake" }), ACTOR);
      expect(posted).toMatchObject({ ...PAIR, type: "correction", position: 0, quantity: "24.000000", businessDate: "2027-01-05", enteredQuantity: "2.000000", enteredUnit: "case", numerator: "12", denominator: "1", balanceBefore: "0.000000", balanceAfter: "24.000000", reason: "Opening balance", actorUserId: "u1", actorUsername: "alice", channel: "ui" });
      expect(posted.postingId).toMatch(/^[a-f0-9-]{36}$/);
      expect((await service().get(PAIR)).movements).toEqual([posted]);
      expect(await entries()).toEqual([expect.objectContaining({ action: "stock.movement.posted", actorUsername: "alice", sessionId: "session1", before: { quantity: "0.000000" }, after: expect.objectContaining({ quantity: "24.000000", movement: "24.000000", reason: "Opening balance", postingId: posted.postingId }) })]);
    } finally { vi.useRealTimers(); }
  });
  it("preserves a negative fraction and original factors after a conversion edit", async () => {
    await service().correct(line("2"), ACTOR);
    const out = await service().correct(line("-0.125", { unit: "case" }), { ...ACTOR, channel: "api", sessionId: null, token: { id: "t", name: "integration" } });
    expect(out).toMatchObject({ quantity: "-1.500000", enteredQuantity: "-0.125000", numerator: "12", balanceAfter: "0.500000", channel: "api" });
    const em = scoped(); const conversion = await em.findOneOrFail(MaterialConversion, { unit: "case" }); conversion.numerator = "20"; await em.flush();
    expect((await service().get(PAIR)).movements).toEqual(expect.arrayContaining([expect.objectContaining({ id: out.id, numerator: "12", quantity: "-1.500000" })]));
    expect(await entries()).toEqual(expect.arrayContaining([expect.objectContaining({ tokenId: "t", tokenName: "integration", sessionId: null })]));
  });
  it("refuses an overdraw with available/required context and writes no movement or audit (INV-006)", async () => {
    await service().correct(line("2"), ACTOR);
    await expect(service().correct(line("-3"), ACTOR)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", message: expect.stringContaining("available 2.000000 each; requested 3.000000 each") });
    expect((await service().get(PAIR)).quantity).toBe("2.000000");
    expect(await entries()).toHaveLength(1);
    expect(await scoped().count(StockMovement, {})).toBe(1);
  });
  it("posts an ordered group cumulatively and permits zero stock", async () => {
    const result = await service().post({ reason: "Count", lines: [line("2"), line("-1"), line("-1")] }, { type: "correction", id: randomUUID() }, ACTOR);
    expect(result.map((row) => [row.balanceBefore, row.balanceAfter])).toEqual([["0.000000", "2.000000"], ["2.000000", "1.000000"], ["1.000000", "0.000000"]]);
    expect((await service().get(PAIR)).quantity).toBe("0.000000");
    expect(await entries()).toHaveLength(3);
  });
  it("rejects negative intermediate balances and rolls back earlier group lines", async () => {
    for (const quantities of [["-2", "2"], ["2", "-3"]]) {
      await expect(service().post({ reason: "Count", lines: quantities.map((quantity) => line(quantity)) }, { type: "correction", id: randomUUID() }, ACTOR)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      expect(await scoped().count(StockBalance, {})).toBe(0);
      expect(await scoped().count(StockMovement, {})).toBe(0);
      expect(await entries()).toEqual([]);
    }
  });
  it("bounds resulting balances and refuses missing reasons/zero deltas/rounding to zero", async () => {
    await service().correct(line("999999999999.999999"), ACTOR);
    await expect(service().correct(line("0.000001"), ACTOR)).rejects.toMatchObject({ code: "QUANTITY_OUT_OF_RANGE" });
    await expect(service().correct(line("0"), ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service().correct(line("1", { reason: " " }), ACTOR)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const em = scoped(); const material = await em.findOneOrFail(Material, { code: PAIR.material }); em.create(MaterialConversion, { material, unit: "tiny", numerator: "1", denominator: "1000000" }); await em.flush();
    await expect(service().correct(line("0.000001", { unit: "tiny" }), ACTOR)).rejects.toMatchObject({ code: "QUANTITY_ROUNDS_TO_ZERO" });
    expect(await entries()).toHaveLength(1);
  });
  it("refuses inactive, unknown and other-tenant references without a write (INV-019/020, TEN-014)", async () => {
    await expect(service().correct(line("1", { material: "00000002" }), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
    await expect(service().correct(line("1", { location: "00000002" }), ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
    await expect(service("test").correct(line(), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(service().correct(line("1", { location: "00000003" }), ACTOR)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(service().correct(line("1", { unit: "unknown" }), ACTOR)).rejects.toMatchObject({ code: "UNIT_NOT_CONVERTIBLE" });
    expect(await entries()).toEqual([]);
    expect(await scoped().count(StockBalance, {})).toBe(0);
  });
  it("keeps equal business IDs isolated (INV-018)", async () => {
    await masters("test"); await service("test").correct(line("7"), ACTOR);
    expect((await service("test").get(PAIR)).quantity).toBe("7.000000");
    expect((await service().get(PAIR)).quantity).toBe("0.000000");
    expect(await entries()).toEqual([]);
  });
  it("rolls back balances, movements and audit if flushing fails", async () => {
    const em = scoped();
    vi.spyOn(em, "transactional").mockImplementation(async (cb) => cb(em));
    vi.spyOn(em, "flush").mockRejectedValue(new Error("disk full"));
    await expect(new StockService({ em }).correct(line(), ACTOR)).rejects.toThrow("disk full");
    expect((await service().get(PAIR)).quantity).toBe("0.000000");
    expect(await entries()).toEqual([]);
  });
  it("locks type/base unit forever and blocks master deactivation until zero (MAT-010/012, LFC-012/016)", async () => {
    await service().correct(line("2"), ACTOR);
    const material = new MaterialService({ em: scoped() }); const location = new LocationService({ em: scoped() });
    for (const fields of [{ type: "finished" as const }, { baseUnit: "kg" }]) await expect(material.update(PAIR.material, fields, 1, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_HAS_MOVEMENTS" });
    await expect(material.update(PAIR.material, { active: false }, 1, ACTOR)).rejects.toMatchObject({ code: "STOCK_NOT_EMPTY", message: expect.stringContaining("00000001 holds 2.000000 each") });
    await expect(location.update(PAIR.location, { active: false }, 1, ACTOR)).rejects.toMatchObject({ code: "STOCK_NOT_EMPTY" });
    await service().correct(line("-2"), ACTOR);
    await expect(material.update(PAIR.material, { baseUnit: "kg" }, 1, ACTOR)).rejects.toMatchObject({ code: "MATERIAL_HAS_MOVEMENTS" });
    await material.update(PAIR.material, { active: false }, 1, ACTOR);
    await location.update(PAIR.location, { active: false }, 1, ACTOR);
    expect(await service().get(PAIR)).toMatchObject({ quantity: "0.000000", materialActive: false, locationActive: false });
  });
  it("seeds real openings once with explicit provenance; skips read-only/edited/missing-reference datasets", async () => {
    const seed = scoped(); const steel = await seed.findOneOrFail(Material, { code: "00000001" }); steel.baseUnit = "kg"; await seed.flush();
    expect(await service().seedDemo()).toBe(1);
    expect((await service().get(PAIR)).movements[0]).toMatchObject({ actorUserId: null, actorUsername: "Demo seed", channel: "seed", reason: "Demonstration opening balance" });
    expect(await entries()).toEqual([]);
    expect(await service().seedDemo()).toBe(0);
    expect(await service("test").seedDemo()).toBe(0);
    const em = scoped("test"); const tenant = await em.findOneOrFail(Tenant, { code: "test" }); tenant.readOnly = true; await em.flush();
    expect(await service("test").seedDemo()).toBe(0);
  });
  it("revalidates cached masters at posting time after another request deactivates them", async () => {
    const em = scoped();
    await em.findOneOrFail(Material, { code: PAIR.material });
    await em.findOneOrFail(Location, { code: PAIR.location });
    const other = scoped();
    const material = await other.findOneOrFail(Material, { code: PAIR.material });
    material.active = false; await other.flush();
    await expect(new StockService({ em }).correct(line(), ACTOR)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
    material.active = true;
    const location = await other.findOneOrFail(Location, { code: PAIR.location }); location.active = false; await other.flush();
    await expect(new StockService({ em }).correct(line(), ACTOR)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
    expect(await entries()).toEqual([]);
    expect(await scoped().count(StockBalance, {})).toBe(0);
  });
  it("prevents two competing withdrawals spending the same stock (INV-021)", async () => {
    await service().correct(line("2"), ACTOR);
    const other = await initOrm({ databasePath: path.join(directory, "db.sqlite") });
    let raced = false;
    try {
      const em = scoped();
      await expect(retryingStaleSnapshot(() => inRequestTransaction(em, async () => {
        await new StockService({ em }).get(PAIR);
        if (!raced) { raced = true; await new StockService({ em: scoped("prod", other) }).correct(line("-2"), ACTOR); }
        return new StockService({ em }).correct(line("-2"), ACTOR);
      }))).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
      expect((await service().get(PAIR)).quantity).toBe("0.000000");
      expect(await entries()).toHaveLength(2);
      expect(await scoped().count(StockMovement, {})).toBe(2);
    } finally { await other.close(); }
  });
});
