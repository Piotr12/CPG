import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, Material, MaterialConversion, Location, Bom, BomRevision, BomComponent, StockBalance, StockMovement,
  PlanningParameterSet, ProductionOrder, TenantAuditEvent, selectTenant, UniqueConstraintViolationException, OptimisticLockError, type Orm, type EntityManager, type TenantCode } from "@cpg/db";
import { ProductionOrderService } from "./production-order.service";
import { ProductionCompletionService } from "./production-completion.service";
import { productionUsingMaterial, assertNoProductionOrders } from "./production-order-usage";
import { MaterialService } from "../materials/material.service";
import { LocationService } from "../locations/location.service";
import type { AuditActor } from "../audit/actor";

const actor: AuditActor = { userId: "user", username: "alice", sessionId: "session", channel: "ui", token: null };
const input = { output: "00000001", location: "00000001", quantity: "30", unit: "each", plannedFinish: "2026-10-15" };
let orm: Orm;
function em(tenant: TenantCode = "prod") { const result = orm.em.fork(); selectTenant(result, tenant); return result; }
const service = (manager: EntityManager = em()) => new ProductionOrderService({ em: manager });
async function masters(tenant: TenantCode = "prod") {
  const manager = em(tenant);
  const output = manager.create(Material, { code: "00000001", type: "finished", description: "Cabinet", baseUnit: "each" });
  const component = manager.create(Material, { code: "00000002", type: "raw", description: "Steel", baseUnit: "kg" });
  const location = manager.create(Location, { code: "00000001", name: "Plant" });
  manager.create(Location, { code: "00000002", name: "Elsewhere" });
  manager.create(MaterialConversion, { material: output, unit: "case", numerator: "10", denominator: "1" });
  manager.create(PlanningParameterSet, { material: output, location, procurement: "make", leadTimeDays: 5, minimumQuantity: "1", lotMultiple: "1" });
  for (const priority of [1, 2]) {
    const bom = manager.create(Bom, { code: `0000000${priority}`, output, revision: 1 });
    const revision = manager.create(BomRevision, { bom, number: 1, priority, validFrom: "2026-01-01", validThrough: null });
    manager.create(BomComponent, { revision, position: 0, material: component, quantity: priority === 1 ? "2.000000" : "1.000000",
      enteredQuantity: priority === 1 ? "2" : "1", enteredUnit: "kg", numerator: "1", denominator: "1" });
  }
  await manager.flush();
}
async function auditCount() { return em().count(TenantAuditEvent, {}); }
async function balance(quantity = "30.000000", locationCode = "00000001") {
  const manager = em();
  const material = await manager.findOneOrFail(Material, { code: "00000002" });
  const location = await manager.findOneOrFail(Location, { code: locationCode });
  manager.create(StockBalance, { material, location, quantity }); await manager.flush();
}
beforeEach(async () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-production-")), "db.sqlite");
  await migrate({ databasePath }); orm = await initOrm({ databasePath }); await masters();
});
afterEach(async () => { vi.restoreAllMocks(); await orm.close(); });

describe("production lifecycle", () => {
  it("cancels untouched work, records before/after and rejects terminal or stale changes", async () => {
    const order = await service().create(input, actor);
    expect(order.hasProcessing).toBe(false);
    await expect(service().closeEarly(order.id, order.version, actor)).rejects.toMatchObject({ code: "DOCUMENT_UNPROCESSED" });
    const cached = service(); await cached.get(order.id);
    const cancelled = await service().cancel(order.id, order.version, actor);
    expect(cancelled).toMatchObject({ status: "cancelled", abandoned: "30.000000", produced: "0.000000", outstanding: "0.000000", version: 2 });
    expect(await em().findOneOrFail(TenantAuditEvent, { action: "production-orders.production-order.cancelled" })).toMatchObject({
      before: { status: "open", abandoned: "0.000000" }, after: { status: "cancelled", abandoned: "30.000000" },
    });
    await expect(cached.cancel(order.id, order.version, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service().cancel(order.id, cancelled.version, actor)).rejects.toMatchObject({ code: "DOCUMENT_NOT_OPEN" });
    await expect(service().update(order.id, { quantity: "40" }, cancelled.version, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_LOCKED" });
    await expect(service(em("test")).cancel(order.id, order.version, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
    const manager = em(); vi.spyOn(manager, "transactional").mockRejectedValueOnce(new OptimisticLockError("stale"));
    await expect(service(manager).cancel(order.id, cancelled.version, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await em().count(StockMovement, {})).toBe(0);
  });

  it.each(["10", "0"])("retains a %s-output completion and abandons only the remainder", async (quantity) => {
    const order = await service().create({ ...input, bom: "00000001", revision: 1 }, actor);
    await balance("100.000000");
    const completion = new ProductionCompletionService({ em: em() });
    const postInput = { quantity, unit: "each", components: [{ material: "00000002", quantity: "20", unit: "kg" }] };
    await completion.post(order.id, postInput, actor);
    const partial = await service().get(order.id);
    expect(partial.hasProcessing).toBe(true);
    await expect(service().cancel(order.id, partial.version, actor)).rejects.toMatchObject({ code: "DOCUMENT_PROCESSED" });
    const movements = await em().count(StockMovement, {});
    const closed = await service().closeEarly(order.id, partial.version, actor);
    expect(closed).toMatchObject({ status: "closed-early", produced: `${quantity}.000000`, abandoned: quantity === "0" ? "30.000000" : "20.000000", outstanding: "0.000000" });
    expect(await em().count(StockMovement, {})).toBe(movements);
    expect((await em().findOneOrFail(StockBalance, { material: { code: "00000002" } })).quantity).toBe("80.000000");
    expect(await em().count(TenantAuditEvent, { action: "production-orders.production-order.closed-early" })).toBe(1);
    await expect(completion.post(order.id, postInput, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_LOCKED" });
  });
});

describe("manual production", () => {
  it("pins the explicit lower-priority recipe, records audit, derives dates and creates no stock (PRD-001/003/007/008/009)", async () => {
    const first = await service().create({ ...input, bom: "00000002", revision: 1 }, actor);
    const second = await service().create(input, actor);
    expect(first).toMatchObject({ id: "00000001", output: input.output, location: input.location, bom: "00000002", revision: 1,
      quantity: "30.000000", enteredQuantity: "30", plannedFinish: "2026-10-15", plannedStart: "2026-10-10", leadTimeDays: 5,
      produced: "0.000000", abandoned: "0.000000", status: "open", version: 1, createdAt: expect.any(Date), updatedAt: expect.any(Date) });
    expect(second).toMatchObject({ id: "00000002", bom: "00000001" });
    expect(await em().count(StockMovement, {})).toBe(0); expect(await em().count(StockBalance, {})).toBe(0);
    const audit = await em().findOneOrFail(TenantAuditEvent, { subjectId: first.id, action: "production-orders.production-order.created" });
    expect(audit).toMatchObject({ subjectType: "ProductionOrder", subjectLabel: "00000001 — 00000001 Cabinet", before: null,
      after: { id: first.id, output: input.output, bom: "00000002", revision: 1, leadTimeDays: 5, numerator: "1", denominator: "1", quantity: "30.000000" } });
    expect(audit.after).not.toHaveProperty("version");
  });
  it("defaults to the highest feasible recipe or the top usable recipe with shortages (PRD-002/004/022)", async () => {
    const missing = await service().options(input);
    expect(missing.selected).toEqual({ bom: "00000001", revision: 1 });
    expect(missing.alternatives[0].components[0]).toMatchObject({ required: "60.000000", available: "0.000000", shortage: "60.000000" });
    await balance();
    const options = await service().options(input);
    expect(options.selected).toEqual({ bom: "00000002", revision: 1 });
    const order = await service().create({ ...input, bom: "00000001", revision: 1 }, actor);
    expect(order.shortages).toEqual([expect.objectContaining({ required: "60.000000", available: "30.000000", shortage: "30.000000" })]);
    expect((await em().findOneOrFail(StockBalance, {})).quantity).toBe("30.000000");
    expect(await em().count(StockMovement, {})).toBe(0);
    expect((await service().create(input, actor)).shortages).toEqual([]);
  });
  it("ignores other-site stock and isolates IDs, reads and shortages by tenant", async () => {
    await balance("1000.000000", "00000002"); await masters("test");
    await service().create(input, actor);
    expect((await service(em("test")).create(input, actor)).id).toBe("00000001");
    expect((await service().get("00000001")).shortages[0].available).toBe("0.000000");
    expect(await service(em("test")).list()).toHaveLength(1);
    await expect(service(em("test")).get("00000002")).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
    await expect(service().get("malformed")).rejects.toMatchObject({ code: "PRODUCTION_ORDER_NOT_FOUND" });
  });
  it("checks active masters, Make at this location and schema input before writing", async () => {
    await expect(service().create({ ...input, output: "00000099" }, actor)).rejects.toMatchObject({ code: "MATERIAL_NOT_FOUND" });
    await expect(service().create({ ...input, location: "00000099" }, actor)).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND" });
    await expect(service().create({ ...input, output: "00000002" }, actor)).rejects.toMatchObject({ code: "PRODUCTION_REQUIRES_MAKE" });
    await expect(service().create({ ...input, location: "00000002" }, actor)).rejects.toMatchObject({ code: "PRODUCTION_REQUIRES_MAKE" });
    const manager = em(); const set = await manager.findOneOrFail(PlanningParameterSet, {}); set.procurement = "buy"; await manager.flush();
    await expect(service().create(input, actor)).rejects.toMatchObject({ code: "PRODUCTION_REQUIRES_MAKE" });
    await manager.nativeUpdate(Material, { code: input.output }, { active: false });
    await expect(service().create(input, actor)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
    await manager.nativeUpdate(Material, { code: input.output }, { active: true });
    await manager.nativeUpdate(Location, { code: input.location }, { active: false });
    await expect(service().create(input, actor)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
    await expect(service().create({ ...input, quantity: "0" }, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await service().count()).toBe(0); expect(await auditCount()).toBe(0);
  });
  it("refuses inactive, expired, future and superseded new recipes (PRD-005)", async () => {
    await expect(service().options({ ...input, plannedFinish: "2025-12-31" })).rejects.toMatchObject({ code: "PRODUCTION_NO_USABLE_BOM" });
    const manager = em(); await manager.nativeUpdate(Bom, { code: "00000001" }, { revision: 2 });
    expect((await service().options(input)).alternatives.map(({ bom }) => bom)).toEqual(["00000002"]);
    await expect(service().create({ ...input, bom: "00000001", revision: 1 }, actor)).rejects.toMatchObject({ code: "PRODUCTION_BOM_CHANGED" });
    await expect(service().create({ ...input, bom: "00000002", revision: 2 }, actor)).rejects.toMatchObject({ code: "PRODUCTION_BOM_CHANGED" });
    await manager.nativeUpdate(Bom, {}, { active: false });
    await expect(service().create(input, actor)).rejects.toMatchObject({ code: "PRODUCTION_NO_USABLE_BOM" });
    expect(await auditCount()).toBe(0);
  });
  it("refuses an explicit expired BOM/revision pair, writing nothing, and offers only date-valid alternatives (BOM-028)", async () => {
    const manager = em(); const bom = await manager.findOneOrFail(Bom, { code: "00000001" });
    const component = await manager.findOneOrFail(Material, { code: "00000002" });
    const revision = manager.create(BomRevision, { bom, number: 2, priority: 1, validFrom: "2026-01-01", validThrough: "2026-09-30" });
    manager.create(BomComponent, { revision, position: 0, material: component, quantity: "3", enteredQuantity: "3", enteredUnit: "kg", numerator: "1", denominator: "1" });
    bom.revision = 2; await manager.flush();
    expect((await service().options(input)).alternatives.map((offered) => [offered.bom, offered.revision])).toEqual([["00000002", 1]]);
    await expect(service().create({ ...input, bom: "00000001", revision: 2 }, actor)).rejects.toMatchObject({ code: "PRODUCTION_BOM_CHANGED" });
    expect([await service().count(), await auditCount(), await em().count(StockMovement, {})]).toEqual([0, 0, 0]);
    expect(await service().create({ ...input, plannedFinish: "2026-09-30", bom: "00000001", revision: 2 }, actor)).toMatchObject({ bom: "00000001", revision: 2 });
  });
  it("rejects new recipes with inactive components and includes the inclusive valid-through endpoint", async () => {
    const manager = em(); const bom = await manager.findOneOrFail(Bom, { code: "00000001" });
    const component = await manager.findOneOrFail(Material, { code: "00000002" });
    const revision = manager.create(BomRevision, { bom, number: 2, priority: 1, validFrom: input.plannedFinish, validThrough: input.plannedFinish });
    manager.create(BomComponent, { revision, position: 0, material: component, quantity: "1", enteredQuantity: "1", enteredUnit: "kg", numerator: "1", denominator: "1" });
    bom.revision = 2; await manager.flush();
    expect((await service().options(input)).alternatives[0]).toMatchObject({ bom: bom.code, revision: 2, validThrough: input.plannedFinish });
    expect((await service().options({ ...input, plannedFinish: "2026-10-16" })).alternatives).toHaveLength(1);
    await manager.nativeUpdate(Material, { code: component.code }, { active: false });
    await expect(service().create(input, actor)).rejects.toMatchObject({ code: "PRODUCTION_NO_USABLE_BOM" });
  });
  it("keeps pinned revision and captured lead time after BOM/parameter changes and date edits (PRD-006/027)", async () => {
    const order = await service().create(input, actor);
    const manager = em(); const bom = await manager.findOneOrFail(Bom, { code: "00000001" });
    manager.create(BomRevision, { bom, number: 2, priority: 1, validFrom: "2027-01-01", validThrough: null });
    bom.revision = 2; bom.active = false;
    const set = await manager.findOneOrFail(PlanningParameterSet, {}); set.leadTimeDays = 20; await manager.flush();
    const edited = await service().update(order.id, { plannedFinish: "2028-03-01" }, order.version, actor);
    expect(edited).toMatchObject({ bom: "00000001", revision: 1, leadTimeDays: 5, plannedStart: "2028-02-25", version: 2 });
    expect(edited.components[0].quantity).toBe("2.000000");
    expect((await service().get(order.id)).revision).toBe(1);
  });
  it("retains unchanged conversion history, converts changed targets and audits edits (PRD-025)", async () => {
    const original = await service().create({ ...input, quantity: "2", unit: "case" }, actor);
    const manager = em(); const factor = await manager.findOneOrFail(MaterialConversion, {}); factor.numerator = "20"; await manager.flush();
    const noOp = await service().update(original.id, { quantity: "2.000000", unit: "case" }, original.version, actor);
    expect(noOp).toMatchObject({ quantity: "20.000000", numerator: "10", version: 1 });
    expect(await auditCount()).toBe(1);
    const date = await service().update(original.id, { plannedFinish: "2026-10-16" }, 1, actor);
    expect(date).toMatchObject({ quantity: "20.000000", numerator: "10", version: 2 });
    const quantity = await service().update(original.id, { quantity: "3" }, 2, actor);
    expect(quantity).toMatchObject({ quantity: "60.000000", numerator: "20", version: 3 });
    const unit = await service().update(original.id, { unit: "each" }, 3, actor);
    expect(unit).toMatchObject({ quantity: "3.000000", enteredUnit: "each", version: 4 });
    const audit = await em().find(TenantAuditEvent, { action: "production-orders.production-order.updated" });
    expect(audit).toHaveLength(3); expect(audit[0].before).toMatchObject({ plannedFinish: input.plannedFinish });
    expect(audit[0].after).toMatchObject({ plannedFinish: "2026-10-16" });
    expect((await service().update(original.id, {}, 4, actor)).version).toBe(4);
  });
  it("refuses stale/terminal edits and a target below already produced output without auditing", async () => {
    const order = await service().create(input, actor);
    await expect(service().update(order.id, {}, 99, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const manager = em(); await manager.nativeUpdate(ProductionOrder, { code: order.id }, { produced: "10.000000" });
    await expect(service().update(order.id, { quantity: "9" }, (await service().get(order.id)).version, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { quantity: expect.any(Array) } });
    await manager.nativeUpdate(ProductionOrder, { code: order.id }, { status: "completed" });
    await expect(service().update(order.id, { plannedFinish: "2026-10-16" }, (await service().get(order.id)).version, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_LOCKED" });
    expect(await auditCount()).toBe(1);
  });
  it("bounds list pages and rejects invalid page/input queries", async () => {
    const order = await service().create(input, actor);
    expect(await service().list()).toEqual([expect.objectContaining({ id: order.id })]);
    expect(await service().list({ page: 2 })).toEqual([]); expect(await service().count()).toBe(1);
    await expect(service().list({ page: 0 })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service().options({ ...input, quantity: "0" })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(service().update(order.id, { quantity: "0" }, 1, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
  describe("sorted and searched (#217)", () => {
    // 105 orders, inserted newest first, of outputs and at locations whose UUIDs run against their IDs.
    const COUNT = 105;
    const day = (offset: number) => `2027-01-${String(offset + 1).padStart(2, "0")}`;
    const model = Array.from({ length: COUNT }, (_, index) => {
      const n = index + 1;
      return { id: String(n).padStart(8, "0"), output: n % 3 === 0 ? "00000003" : "00000001", location: n <= 50 ? "00000002" : "00000001",
        finish: day(n % 7), start: day((n * 5) % 11), status: n % 4 === 0 ? "cancelled" : "open",
        // A number, so `sorted` compares it as one: 5 < 25 < 100, where the stored text puts "100" first.
        quantity: (n * 37) % 120 };
    });
    type Row = (typeof model)[number];
    const sorted = (key: keyof Row, sign: 1 | -1) =>
      [...model].sort((a, b) => (a[key] === b[key] ? (a.id < b.id ? -1 : 1) : a[key] < b[key] ? -sign : sign)).map(({ id }) => id);
    const allPages = async (options: Parameters<ProductionOrderService["list"]>[0] = {}) =>
      (await Promise.all([1, 2].map((page) => service().list({ ...options, page })))).flat().map(({ id }) => id);

    beforeEach(async () => {
      const manager = em();
      const outputs = new Map([
        ["00000001", await manager.findOneOrFail(Material, { code: "00000001" })],
        ["00000003", manager.create(Material, { id: "00000000-0000-4000-8000-000000000003", code: "00000003", type: "intermediate", description: "Drawer front", baseUnit: "each" })],
      ]);
      const locations = new Map((await manager.find(Location, {})).map((location) => [location.code, location]));
      const recipe = await manager.findOneOrFail(BomRevision, { bom: { code: "00000001" } });
      for (const row of [...model].reverse()) {
        manager.create(ProductionOrder, { code: row.id, output: outputs.get(row.output)!, location: locations.get(row.location)!, recipe,
          quantity: `${row.quantity}.000000`, enteredQuantity: String(row.quantity), enteredUnit: "each", numerator: "1", denominator: "1",
          plannedFinish: row.finish, plannedStart: row.start, leadTimeDays: 0, status: row.status as "open" });
      }
      await manager.flush();
    });

    it("sorts by each column, both ways, by ID within equal values, across the page boundary", async () => {
      expect(await allPages()).toEqual(sorted("id", 1));
      expect(await allPages({ sort: "id", dir: "desc" })).toEqual(sorted("id", -1));
      for (const key of ["output", "quantity", "location", "finish", "start", "status"] as const) {
        expect(await allPages({ sort: key })).toEqual(sorted(key, 1));
        expect(await allPages({ sort: key, dir: "desc" })).toEqual(sorted(key, -1));
      }
      expect((await service().list({ sort: "finish", page: 2 })).map(({ id }) => id)).toEqual(sorted("finish", 1).slice(100));
    });

    it("keeps orders whose ID or output ID or description holds every word, counts them, in this tenant only", async () => {
      const drawers = model.filter(({ output }) => output === "00000003").map(({ id }) => id);
      expect(await allPages({ q: "DRAWER" })).toEqual(drawers);
      expect(await service().count({ q: "drawer front" })).toBe(drawers.length);
      expect(await allPages({ q: "front 00000006" })).toEqual(["00000006"]);
      // Order 1, and every order of output 1.
      expect(await service().count({ q: "00000001" })).toBe(model.filter(({ id, output }) => id === "00000001" || output === "00000001").length);
      expect(await allPages({ q: "cabinet", sort: "start", dir: "desc" })).toEqual(sorted("start", -1).filter((id) => !drawers.includes(id)));
      expect(await service().count({ q: "%" })).toBe(COUNT);
      expect(await service().count({ q: "drawer_front" })).toBe(drawers.length);
      expect(await service(em("test")).count({ q: "drawer" })).toBe(0);
      expect(await service(em("test")).list({ q: "cabinet" })).toEqual([]);
    });
  });
  it("maps unique creates and optimistic edits but propagates unexpected transaction errors", async () => {
    const manager = em(); const spy = vi.spyOn(manager, "transactional");
    spy.mockRejectedValueOnce(new UniqueConstraintViolationException(new Error("race")));
    await expect(service(manager).create(input, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_ID_RACE" });
    spy.mockRejectedValueOnce(new OptimisticLockError("race"));
    await expect(service(manager).update("00000001", {}, 1, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    spy.mockRejectedValueOnce(new Error("disk failure"));
    await expect(service(manager).create(input, actor)).rejects.toThrow("disk failure");
  });
  it("exhausts codes cleanly and rolls back failures that occur after insertion", async () => {
    const order = await service().create(input, actor); const manager = em();
    await manager.nativeUpdate(ProductionOrder, { code: order.id }, { code: "99999999" });
    await expect(service().create(input, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_IDS_EXHAUSTED" });
    expect(await service().count()).toBe(1);
    const transaction = em(); vi.spyOn(transaction, "transactional").mockImplementation(async (callback) => callback(transaction));
    const flush = vi.spyOn(transaction, "flush").mockRejectedValueOnce(new Error("flush failure"));
    await expect(service(transaction).update("99999999", { plannedFinish: "2026-10-16" }, (await service().get("99999999")).version, actor)).rejects.toThrow("flush failure");
    expect(flush).toHaveBeenCalled(); expect((await service().get("99999999")).plannedFinish).toBe(input.plannedFinish);
  });
});

describe("production master references", () => {
  it("links blocking direct references, locks historic output units/type, and permits terminal deactivation", async () => {
    const order = await service().create(input, actor); const manager = em();
    const output = await manager.findOneOrFail(Material, { code: input.output }); const location = await manager.findOneOrFail(Location, { code: input.location });
    expect(await productionUsingMaterial(manager, output)).toBe(order.id);
    await expect(assertNoProductionOrders(manager, { output })).rejects.toMatchObject({ code: "MATERIAL_HAS_PRODUCTION_ORDERS", messageParams: { order: order.id } });
    await expect(new LocationService({ em: em() }).update(location.code, { active: false }, location.version, actor)).rejects.toMatchObject({ code: "LOCATION_HAS_PRODUCTION_ORDERS" });
    await expect(new MaterialService({ em: em() }).update(output.code, { active: false }, output.version, actor)).rejects.toMatchObject({ code: "MATERIAL_HAS_PRODUCTION_ORDERS" });
    for (const change of [{ type: "intermediate" as const }, { baseUnit: "kg" }]) {
      await expect(new MaterialService({ em: em() }).update(output.code, change, output.version, actor)).rejects.toMatchObject({ code: change.type ? "MATERIAL_TYPE_IN_USE" : "BASE_UNIT_IN_USE" });
    }
    await manager.nativeUpdate(ProductionOrder, { code: order.id }, { status: "cancelled" });
    await expect(assertNoProductionOrders(em(), { location })).resolves.toBeUndefined();
    expect(await productionUsingMaterial(em(), output)).toBe(order.id);
    const unused = await manager.findOneOrFail(Material, { code: "00000002" });
    expect(await productionUsingMaterial(manager, unused)).toBeNull();
  });
});

describe("demo", () => {
  it("seeds a dated, unaudited order under the user rules, with a planned start before the revision's validity", async () => {
    const at = new Date("2025-03-10T08:00:00Z");
    const auditBefore = await auditCount();
    expect(await service().seedDemo({ ...input, plannedFinish: "2026-01-03", bom: "00000001", revision: 1 }, at)).toEqual({ id: "00000001" });
    expect(await service().get("00000001")).toMatchObject({ id: "00000001", status: "open", plannedStart: "2025-12-29", plannedFinish: "2026-01-03", bom: "00000001", revision: 1 });
    const stored = await em().findOneOrFail(ProductionOrder, { code: "00000001" });
    expect(stored.createdAt).toEqual(at); expect(stored.updatedAt).toEqual(at);
    expect(await auditCount()).toBe(auditBefore);
    await expect(service().seedDemo({ ...input, plannedFinish: "2025-12-31" }, at)).rejects.toMatchObject({ code: "PRODUCTION_NO_USABLE_BOM" });
    expect(await em().count(ProductionOrder, {})).toBe(1);
  });
});

it("loads only current revisions and groups recipe components instead of hydrating immutable history", async () => {
  const manager = em(); const bom = await manager.findOneOrFail(Bom, { code: "00000001" });
  for (let number = 2; number <= 151; number += 1) {
    const revision = manager.create(BomRevision, { bom, number, priority: 1, validFrom: "2026-01-01", validThrough: null });
    if (number === 151) manager.create(BomComponent, { revision, position: 0, material: await manager.findOneOrFail(Material, { code: "00000002" }), quantity: "2", enteredQuantity: "2", enteredUnit: "kg", numerator: "1", denominator: "1" });
  }
  bom.revision = 151; await manager.flush(); manager.clear();
  const reads = vi.spyOn(manager, "find");
  const options = await service(manager).options(input);
  expect(options.alternatives.map(({ revision }) => revision).sort((a, b) => a - b)).toEqual([1, 151]);
  const revisionReads = reads.mock.calls.map(([entity], index) => entity === BomRevision ? reads.mock.results[index].value : null).filter((value) => value !== null);
  expect(revisionReads).toHaveLength(1); expect(await revisionReads[0]).toHaveLength(2);
  expect(reads.mock.calls.filter(([entity]) => entity === BomComponent)).toHaveLength(1);
});

it("keeps alternatives beyond the first 100 selectable while bounding current-revision query batches", async () => {
  const manager = em();
  const output = await manager.findOneOrFail(Material, { code: input.output });
  const material = await manager.findOneOrFail(Material, { code: "00000002" });
  for (let priority = 3; priority <= 104; priority += 1) {
    const bom = manager.create(Bom, { code: String(priority).padStart(8, "0"), output, revision: 1 });
    const revision = manager.create(BomRevision, { bom, number: 1, priority, validFrom: "2026-01-01", validThrough: null });
    manager.create(BomComponent, { revision, position: 0, material, quantity: "1", enteredQuantity: "1", enteredUnit: "kg", numerator: "1", denominator: "1" });
  }
  await manager.flush(); manager.clear();
  const reads = vi.spyOn(manager, "find");
  expect((await service(manager).options(input)).alternatives).toHaveLength(104);
  expect(reads.mock.calls.filter(([entity]) => entity === BomRevision)).toHaveLength(2);
  expect((await service().create({ ...input, bom: "00000104", revision: 1 }, actor)).bom).toBe("00000104");
});

describe("edits after a first completion", () => {
  /** An order of 30 Cabinets on BOM 00000001 (2 kg steel each) with 10 already produced from 20 kg. */
  async function partlyProduced() {
    const order = await service().create({ ...input, bom: "00000001", revision: 1 }, actor);
    await balance("30.000000");
    const posted = await new ProductionCompletionService({ em: em() }).post(order.id, {
      quantity: "10", unit: "each", components: [{ material: "00000002", quantity: "20", unit: "kg" }],
    }, actor);
    expect(posted.order).toMatchObject({ produced: "10.000000", outstanding: "20.000000", version: 2 });
    return posted.order;
  }
  it("refuses a target below what was produced and allows raising it, audited (PRD-026, PRD-025)", async () => {
    const order = await partlyProduced();
    await expect(service().update(order.id, { quantity: "9" }, order.version, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED",
      fieldErrors: { quantity: ["The target cannot be less than the quantity already produced."] } });
    const raised = await service().update(order.id, { quantity: "40" }, order.version, actor);
    expect(raised).toMatchObject({ quantity: "40.000000", produced: "10.000000", outstanding: "30.000000", status: "open", version: 3 });
    const audit = await em().findOneOrFail(TenantAuditEvent, { subjectId: order.id, action: "production-orders.production-order.updated" });
    expect(audit).toMatchObject({ before: { quantity: "30.000000", produced: "10.000000" }, after: { quantity: "40.000000", produced: "10.000000", status: "open" } });
  });
  it("keeps output, location and recipe locked and moves the planned finish (PRD-024, PRD-027)", async () => {
    const order = await partlyProduced();
    for (const change of [{ output: "00000002" }, { location: "00000002" }, { bom: "00000002" }, { revision: 2 }]) {
      await expect(service().update(order.id, change as never, order.version, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }
    expect(await service().update(order.id, { plannedFinish: "2026-10-20" }, order.version, actor)).toMatchObject({
      output: input.output, location: input.location, bom: "00000001", revision: 1, plannedFinish: "2026-10-20", plannedStart: "2026-10-15" });
  });
  it("completes the order when the target is lowered to exactly what was produced (spec Q8)", async () => {
    const order = await partlyProduced();
    const completed = await service().update(order.id, { quantity: "10" }, order.version, actor);
    expect(completed).toMatchObject({ quantity: "10.000000", produced: "10.000000", outstanding: "0.000000", status: "completed" });
    const audit = await em().findOneOrFail(TenantAuditEvent, { subjectId: order.id, action: "production-orders.production-order.updated" });
    expect(audit.after).toMatchObject({ status: "completed" });
    await expect(service().update(order.id, { quantity: "12" }, completed.version, actor)).rejects.toMatchObject({ code: "PRODUCTION_ORDER_LOCKED" });
  });
  it("requires components for the outstanding quantity only, and none once the order is closed early (LFC-004, PRD-029)", async () => {
    const order = await service().create({ ...input, quantity: "100", bom: "00000001", revision: 1 }, actor);
    await balance("100.000000");
    await new ProductionCompletionService({ em: em() }).post(order.id, {
      quantity: "40", unit: "each", components: [{ material: "00000002", quantity: "80", unit: "kg" }],
    }, actor);
    const open = await service().get(order.id);
    expect(open).toMatchObject({ status: "open", produced: "40.000000", outstanding: "60.000000" });
    // 60 Cabinets still to make at 2 kg each, against the 20 kg left: not the 200 kg the whole target would need.
    expect(open.components).toEqual([expect.objectContaining({ material: "00000002", required: "120.000000", available: "20.000000", shortage: "100.000000" })]);
    expect(open.shortages).toEqual(open.components);
    const closed = await service().closeEarly(order.id, open.version, actor);
    expect(closed).toMatchObject({ status: "closed-early", abandoned: "60.000000", outstanding: "0.000000" });
    expect(closed.components).toEqual([expect.objectContaining({ material: "00000002", quantity: "2.000000", required: "0.000000", shortage: "0.000000" })]);
    expect(closed.shortages).toEqual([]);
    expect(await service().get(order.id)).toMatchObject({ components: closed.components, shortages: [] });
  });
  it("requires nothing of a cancelled or completed order, even with no stock (LFC-004)", async () => {
    const short = await service().create({ ...input, bom: "00000001", revision: 1 }, actor);
    expect(short.shortages).toEqual([expect.objectContaining({ required: "60.000000", shortage: "60.000000" })]);
    const cancelled = await service().cancel(short.id, short.version, actor);
    expect(cancelled.components).toEqual([expect.objectContaining({ required: "0.000000", available: "0.000000", shortage: "0.000000" })]);
    expect(cancelled.shortages).toEqual([]);
    const order = await partlyProduced();
    const completed = await service().update(order.id, { quantity: "10" }, order.version, actor);
    expect(completed).toMatchObject({ status: "completed", outstanding: "0.000000" });
    expect(completed.components).toEqual([expect.objectContaining({ required: "0.000000", shortage: "0.000000" })]);
    expect(completed.shortages).toEqual([]);
  });
  it("locks the type of a material a completion consumed (MAT-012)", async () => {
    await partlyProduced();
    const steel = await em().findOneOrFail(Material, { code: "00000002" });
    await expect(new MaterialService({ em: em() }).update(steel.code, { type: "intermediate" }, steel.version, actor)).rejects.toMatchObject({ code: "MATERIAL_HAS_MOVEMENTS" });
    expect((await em().findOneOrFail(Material, { code: "00000002" })).type).toBe("raw");
  });
});
