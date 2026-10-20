import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Customer, CustomerOrder, CustomerOrderLine, Location, Material, MaterialConversion, Tenant, TenantAuditEvent,
  initOrm, selectTenant, OptimisticLockError, type Orm, type EntityManager, type TenantCode,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "../audit/actor";
import { MaterialService } from "../materials/material.service";
import { CustomerService } from "../customers/customer.service";
import { LocationService } from "../locations/location.service";
import { CustomerOrderService, type CustomerOrderView } from "./customer-order.service";
import type { CustomerOrderChanges, CustomerOrderInput } from "../../validators/customer-orders/customer-order.schema";

const actor: AuditActor = { userId: "admin", username: "admin", sessionId: "browser-1", channel: "ui", token: null };
const line = (material = "00000005", quantity = "60", unit = "each", requiredDate = "2027-01-04") => ({ material, quantity, unit, requiredDate });
const input = (): CustomerOrderInput => ({ customer: "00000001", location: "00000001", lines: [line(), line("00000004", "12", "case", "2027-01-08")] });
const edit = (order: CustomerOrderView): CustomerOrderChanges => ({ customer: order.customer, location: order.location,
  lines: order.lines.map(({ id, material, enteredQuantity, enteredUnit, requiredDate }) => ({ id, material, quantity: enteredQuantity, unit: enteredUnit, requiredDate })) });

describe("CustomerOrderService", () => {
  let orm: Orm;
  const em = (tenant: TenantCode = "test") => { const scope = orm.em.fork(); selectTenant(scope, tenant); return scope; };
  const service = (scope: EntityManager = em()) => new CustomerOrderService({ em: scope });
  const audit = () => em().find(TenantAuditEvent, { action: { $like: "customer-orders.%" } });
  const changeLine = async (id: string, fields: Partial<CustomerOrderLine>) => {
    const scope = em(); scope.assign(await scope.findOneOrFail(CustomerOrderLine, { id }), fields); await scope.flush();
  };
  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-customer-orders-")) });
    await migrateDatabase(config); orm = await initOrm(toDbOptions(config));
    for (const tenant of ["test", "prod"] as const) {
      const scope = em(tenant);
      for (const code of ["00000001", "00000002"]) {
        scope.create(Customer, { code, name: `Customer ${code}` });
        scope.create(Location, { code, name: `Location ${code}` });
      }
      for (const code of ["00000004", "00000005"]) {
        const material = scope.create(Material, { code, description: code, baseUnit: "each", type: "finished" });
        scope.create(MaterialConversion, { material, unit: "case", numerator: "12", denominator: "1" });
        scope.create(MaterialConversion, { material, unit: "third", numerator: "1", denominator: "3" });
        scope.create(MaterialConversion, { material, unit: "huge", numerator: "999999999999", denominator: "0.000001" });
      }
      await scope.flush();
    }
  });
  afterEach(async () => { vi.restoreAllMocks(); await orm.close(); });

  it("stores one location, separate dates and exact historical quantities, starts Open, and audits the UI session (SAL-002, SAL-003, SAL-005, LFC-001)", async () => {
    const orders = service(); expect(await orders.list()).toEqual([]);
    const order = await orders.create(input(), actor);
    expect(order).toMatchObject({ id: "00000001", version: 1, customer: "00000001", location: "00000001", status: "open",
      lines: [ { material: "00000005", quantity: "60.000000", requiredDate: "2027-01-04", fulfilled: "0.000000", abandoned: "0.000000", status: "open" },
        { material: "00000004", quantity: "144.000000", enteredQuantity: "12", enteredUnit: "case", numerator: "12", denominator: "1", requiredDate: "2027-01-08" } ] });
    expect(order.lines[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await orders.get(order.id)).toEqual(order);
    const next = await orders.create({ ...input(), lines: [line("00000005", "1", "third")] }, actor);
    expect(next).toMatchObject({ id: "00000002", lines: [{ quantity: "0.333333" }] });
    expect((await orders.list()).map(({ id }) => id)).toEqual(["00000001", "00000002"]);
    expect(await audit()).toEqual(expect.arrayContaining([expect.objectContaining({ subjectId: order.id, channel: "ui", sessionId: "browser-1", before: null, after: expect.objectContaining({ lines: expect.stringContaining(order.lines[0].id) }) })]));
    const stored = await em().find(CustomerOrderLine, {}, { orderBy: { position: "asc" } });
    expect(stored.every(({ quantity }) => typeof quantity === "string")).toBe(true);
  });

  it("bounds collection pages and groups each document's ordered lines without losing the boundary", async () => {
    const scope = em();
    const customer = await scope.findOneOrFail(Customer, { code: "00000001" });
    const location = await scope.findOneOrFail(Location, { code: "00000001" });
    const material = await scope.findOneOrFail(Material, { code: "00000005" });
    for (let index = 1; index <= 101; index++) {
      const order = scope.create(CustomerOrder, { code: String(index).padStart(8, "0"), customer, location });
      for (const position of [1, 0]) scope.create(CustomerOrderLine, { order, position, material, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1", requiredDate: `2027-01-0${position + 1}` });
    }
    await scope.flush();
    const first = await service().list(); const last = await service().list(2);
    expect(first).toHaveLength(100); expect(first[0].id).toBe("00000001"); expect(first.at(-1)!.id).toBe("00000100");
    expect(last).toHaveLength(1); expect(last[0].id).toBe("00000101");
    expect([...first, ...last].every(({ lines }) => lines.map(({ requiredDate }) => requiredDate).join() === "2027-01-01,2027-01-02")).toBe(true);
    expect(await service().list(3)).toEqual([]); expect(await service().count()).toBe(101); expect(await service(em("prod")).count()).toBe(0);
    await expect(service().list(0)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("allows repeated materials on different dates and keeps stable identities across reordering and line-only edits", async () => {
    const order = await service().create({ ...input(), lines: [line(), line("00000005", "20", "each", "2027-01-08")] }, actor);
    const changes = edit(order); changes.lines.reverse(); changes.lines[0].quantity = "80";
    const updated = await service().update(order.id, changes, order.version, { ...actor, sessionId: null, channel: "api", token: { id: "token", name: "client" } });
    expect(updated.version).toBe(2); expect(updated.updatedAt.getTime()).toBeGreaterThan(order.updatedAt.getTime());
    expect(updated.lines.map(({ id }) => id)).toEqual(order.lines.map(({ id }) => id).reverse());
    expect(updated.lines[0].quantity).toBe("80.000000");
    expect(await audit()).toEqual(expect.arrayContaining([expect.objectContaining({ action: "customer-orders.customer-order.updated", channel: "api", sessionId: null,
      before: expect.objectContaining({ lines: expect.stringContaining('"quantity":"20.000000"') }),
      after: expect.objectContaining({ lines: expect.stringContaining('"quantity":"80.000000"') }) })]));
    await expect(service().update(order.id, edit(order), order.version, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await service().get(order.id)).toEqual(updated);
  });

  it("keeps unchanged historical conversions even after deletion, and a no-op records nothing", async () => {
    const order = await service().create(input(), actor); const scope = em();
    scope.remove(await scope.find(MaterialConversion, { unit: "case" })); await scope.flush();
    const changes = edit(order); changes.lines[1].quantity = "12.000000";
    expect(await service().update(order.id, changes, order.version, actor)).toEqual(order);
    expect(await audit()).toHaveLength(1);
    changes.lines[1].requiredDate = "2028-01-01";
    const updated = await service().update(order.id, changes, order.version, actor);
    expect(updated.lines[1]).toMatchObject({ quantity: "144.000000", numerator: "12", requiredDate: "2028-01-01" });
    const invalid = edit(updated); invalid.lines[1].quantity = "13";
    await expect(service().update(order.id, invalid, updated.version, actor)).rejects.toMatchObject({ fieldErrors: { "lines.1.unit": expect.any(Array) } });
    expect(await service().get(order.id)).toEqual(updated);
  });

  it("creates new lines, changes header/material/unit and preserves removed lines as historical references", async () => {
    const order = await service().create(input(), actor); const changes = edit(order);
    changes.customer = "00000002"; changes.location = "00000002";
    changes.lines = [{ ...changes.lines[0], material: "00000004", unit: "case", quantity: "2" }, line()];
    const updated = await service().update(order.id, changes, 1, actor);
    expect(updated).toMatchObject({ customer: "00000002", location: "00000002", version: 2, lines: [{ id: order.lines[0].id, quantity: "24.000000" }, { quantity: "60.000000" }] });
    expect(updated.lines[1].id).not.toBe(order.lines[1].id);
    expect(await em().count(CustomerOrderLine, { removed: true })).toBe(2);
    expect((await service().get(order.id)).lines).toEqual(updated.lines);
  });

  it.each(["customer", "location", "material"] as const)("refuses missing %s without any document/audit and isolates tenant-only references (SAL-001, TEN-014)", async (kind) => {
    const scope = em("prod");
    if (kind === "material") scope.create(Material, { code: "00000099", description: "foreign", type: "raw", baseUnit: "each" });
    else scope.create(kind === "customer" ? Customer : Location, { code: "00000099", name: "foreign" });
    await scope.flush(); const bad = input();
    if (kind === "material") bad.lines[1].material = "00000099"; else bad[kind] = "00000099";
    await expect(service().create(bad, actor)).rejects.toMatchObject({ code: `${kind.toUpperCase()}_NOT_FOUND` });
    expect(await em().count(CustomerOrder, {})).toBe(0); expect(await em().count(CustomerOrderLine, {})).toBe(0); expect(await audit()).toEqual([]);
  });

  it("isolates order reads, ids and line identity across tenants and orders", async () => {
    const a = await service().create(input(), actor); const b = await service().create(input(), actor);
    const prod = service(em("prod")); expect(await prod.list()).toEqual([]);
    await expect(prod.get(a.id)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_FOUND" });
    const other = await prod.create(input(), actor); expect(other.id).toBe(a.id);
    for (const id of [b.lines[0].id, other.lines[0].id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]) {
      const changes = edit(a); changes.lines[0].id = id;
      await expect(service().update(a.id, changes, 1, actor)).rejects.toMatchObject({ fieldErrors: { "lines.0.id": expect.any(Array) } });
    }
    const repeat = edit(a); repeat.lines[1].id = repeat.lines[0].id;
    await expect(service().update(a.id, repeat, 1, actor)).rejects.toMatchObject({ fieldErrors: { "lines.1.id": expect.any(Array) } });
    expect(await service().get(a.id)).toEqual(a);
    await expect(service().get("bogus")).rejects.toMatchObject({ code: "CUSTOMER_ORDER_NOT_FOUND" });
  });

  it("permits customer deactivation and continued order edits, refuses an inactive customer on new orders", async () => {
    const order = await service().create(input(), actor); const customers = new CustomerService({ em: em() });
    await customers.update(order.customer, { active: false }, 1, actor);
    const changes = edit(order); changes.lines[0].quantity = "80";
    expect(await service().update(order.id, changes, 1, actor)).toMatchObject({ lines: [{ quantity: "80.000000" }, {}] });
    await expect(service().create(input(), actor)).rejects.toMatchObject({ code: "CUSTOMER_INACTIVE" });
  });

  it("refuses inactive newly selected masters but preserves existing inactive material and location", async () => {
    const order = await service().create(input(), actor); const scope = em();
    (await scope.findOneOrFail(Location, { code: "00000002" })).active = false;
    (await scope.findOneOrFail(Material, { code: "00000004" })).active = false; await scope.flush();
    await expect(service().create({ ...input(), location: "00000002" }, actor)).rejects.toMatchObject({ code: "LOCATION_INACTIVE" });
    await expect(service().create(input(), actor)).rejects.toMatchObject({ code: "MATERIAL_INACTIVE" });
    const changes = edit(order); changes.lines[1].requiredDate = "2028-01-01";
    expect((await service().update(order.id, changes, 1, actor)).lines[1].requiredDate).toBe("2028-01-01");
  });

  it.each([["missing", "1"], ["huge", "1"], ["third", "0.000001"]])("refuses conversion %s/%s before writing", async (unit, quantity) => {
    const chosen = unit === "third" ? "case" : unit;
    if (unit === "third") { const scope = em(); const factor = await scope.findOneOrFail(MaterialConversion, { unit: "case", material: { code: "00000005" } }); factor.numerator = "0.000001"; factor.denominator = "1000"; await scope.flush(); }
    await expect(service().create({ ...input(), lines: [line("00000005", quantity, chosen)] }, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await service().list()).toEqual([]); expect(await audit()).toEqual([]);
  });

  it("validates direct service calls as well as HTTP input", async () => {
    await expect(service().create({ ...input(), lines: [] }, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const order = await service().create(input(), actor);
    await expect(service().update(order.id, { ...edit(order), lines: [] }, 1, actor)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("blocks material deactivation with outstanding demand and locks referenced type/base unit permanently (LFC-014)", async () => {
    const order = await service().create(input(), actor); const materials = () => new MaterialService({ em: em() });
    await expect(materials().update("00000005", { active: false }, 1, actor)).rejects.toMatchObject({ code: "MATERIAL_HAS_CUSTOMER_DEMAND", message: expect.stringContaining(order.id), messageParams: { order: order.id } });
    await expect(materials().update("00000005", { type: "raw" }, 1, actor)).rejects.toMatchObject({ code: "MATERIAL_TYPE_IN_USE" });
    await expect(materials().update("00000005", { baseUnit: "kg" }, 1, actor)).rejects.toMatchObject({ code: "BASE_UNIT_IN_USE" });
    const locations = new LocationService({ em: em() });
    await expect(locations.update("00000001", { active: false }, 1, actor)).rejects.toMatchObject({ code: "LOCATION_HAS_CUSTOMER_ORDERS", messageParams: { order: expect.stringMatching(/^\d{8}$/) } });
    const changes = edit(order); changes.lines.shift(); await service().update(order.id, changes, 1, actor);
    await expect(materials().update("00000005", { baseUnit: "kg" }, 1, actor)).rejects.toMatchObject({ code: "BASE_UNIT_IN_USE" });
    expect(await materials().update("00000005", { active: false }, 1, actor)).toMatchObject({ active: false });
  });

  it("respects posted-line and lifecycle edit locks, quantity floor and retained resolved lines", async () => {
    const order = await service().create(input(), actor);
    await changeLine(order.lines[0].id, { fulfilled: "50.000000" });
    for (const changes of [{ ...edit(order), location: "00000002" }, { ...edit(order), customer: "00000002" }])
      await expect(service().update(order.id, changes, 1, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    for (const patch of [{ material: "00000004" }, { unit: "case" }, { requiredDate: "2028-01-01" }]) {
      const changes = edit(order); Object.assign(changes.lines[0], patch);
      await expect(service().update(order.id, changes, 1, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    }
    const low = edit(order); low.lines[0].quantity = "49";
    await expect(service().update(order.id, low, 1, actor)).rejects.toMatchObject({ fieldErrors: { "lines.0.quantity": expect.any(Array) } });
    const remove = edit(order); remove.lines.shift();
    await expect(service().update(order.id, remove, 1, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    await changeLine(order.lines[0].id, { fulfilled: "0.000000", abandoned: "1.000000" });
    await expect(service().update(order.id, remove, 1, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    await changeLine(order.lines[0].id, { abandoned: "0.000000", status: "completed" });
    await expect(service().update(order.id, remove, 1, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    const altered = edit(order); altered.lines[0].quantity = "80";
    await expect(service().update(order.id, altered, 1, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    expect((await service().update(order.id, edit(order), 1, actor)).lines[0].status).toBe("completed");
    const scope = em(); (await scope.findOneOrFail(CustomerOrder, { code: order.id })).status = "completed"; await scope.flush();
    await expect(service().update(order.id, edit(order), 2, actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_LOCKED" });
    expect(await new MaterialService({ em: em() }).update("00000005", { active: false }, 1, actor)).toMatchObject({ active: false });
    expect(await new LocationService({ em: em() }).update("00000001", { active: false }, 1, actor)).toMatchObject({ active: false });
  });

  it("seeds one Test example once, skips missing/inactive references and read-only scopes", async () => {
    expect(await service().seedDemo()).toBe(1); expect(await service().seedDemo()).toBe(0); expect(await audit()).toEqual([]);
    expect((await service().list())[0].lines).toHaveLength(2);
    const scope = em("prod"); (await scope.findOneOrFail(Tenant, { code: "prod" })).readOnly = true; await scope.flush();
    expect(await service(em("prod")).seedDemo()).toBe(0);
    const scope2 = em("prod"); (await scope2.findOneOrFail(Tenant, { code: "prod" })).readOnly = false;
    (await scope2.findOneOrFail(Customer, { code: "00000001" })).active = false; await scope2.flush();
    expect(await service(em("prod")).seedDemo()).toBe(0);
  });
  it("rolls back document and audit together when recording fails", async () => {
    await orm.em.getConnection().execute("create trigger refuse_order_audit before insert on tenant_audit_event when new.action like 'customer-orders.%' begin select raise(abort, 'audit unavailable'); end");
    await expect(service().create(input(), actor)).rejects.toThrow("audit unavailable");
    expect(await service().list()).toEqual([]); expect(await audit()).toEqual([]);
  });

  it("maps a database uniqueness race and keeps the first order", async () => {
    const order = await service().create(input(), actor);
    await orm.em.getConnection().execute("create trigger collide_order before insert on customer_order begin insert into customer_order (id, tenant_code, code, customer_id, location_id, status, created_at, updated_at) select 'collision', tenant_code, code, customer_id, location_id, status, created_at, updated_at from customer_order limit 1; end");
    await expect(service().create(input(), actor)).rejects.toMatchObject({ code: "CUSTOMER_ORDER_ID_RACE" });
    expect(await service().list()).toEqual([order]); expect(await audit()).toHaveLength(1);
  });

  it("propagates database failures during conversion and seed without partial documents", async () => {
    await orm.em.getConnection().execute("drop table material_conversion");
    await expect(service().create(input(), actor)).rejects.toThrow("material_conversion");
    expect(await service().list()).toEqual([]);
    await orm.em.getConnection().execute("create trigger refuse_order before insert on customer_order begin select raise(abort, 'storage unavailable'); end");
    await expect(service().seedDemo()).rejects.toThrow("storage unavailable");
    expect(await service().list()).toEqual([]); expect(await audit()).toEqual([]);
  });

  it("maps an optimistic-lock refusal at the ORM boundary without retrying an overwrite", async () => {
    const order = await service().create(input(), actor); const scope = em();
    vi.spyOn(scope, "transactional").mockRejectedValueOnce(new OptimisticLockError("Changed meanwhile"));
    await expect(service(scope).update(order.id, edit(order), 1, actor)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await service().get(order.id)).toEqual(order); expect(await audit()).toHaveLength(1);
  });

  it("does not count resolved or non-Open demand as an outstanding blocker", async () => {
    const order = await service().create(input(), actor);
    await changeLine(order.lines[0].id, { fulfilled: "60.000000" });
    expect(await new MaterialService({ em: em() }).update("00000005", { active: false }, 1, actor)).toMatchObject({ active: false });
    const scope = em(); (await scope.findOneOrFail(CustomerOrder, { code: order.id })).status = "closed-early"; await scope.flush();
    expect(await new MaterialService({ em: em() }).update("00000004", { active: false }, 1, actor)).toMatchObject({ active: false });
  });

  it("finds outstanding material demand beyond a detached 100-line batch and permits deactivation once all batches resolve", async () => {
    const scope = em(); const customer = await scope.findOneOrFail(Customer, { code: "00000001" });
    const location = await scope.findOneOrFail(Location, { code: "00000001" });
    const material = await scope.findOneOrFail(Material, { code: "00000005" });
    let lastId = "";
    for (let index = 1; index <= 101; index++) {
      const order = scope.create(CustomerOrder, { code: String(index).padStart(8, "0"), customer, location });
      lastId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      scope.create(CustomerOrderLine, { id: lastId, order, position: 0, material, quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1", requiredDate: "2027-01-01", fulfilled: index < 101 ? "1.000000" : "0.000000" });
    }
    await scope.flush();
    await expect(new MaterialService({ em: em() }).update(material.code, { active: false }, 1, actor)).rejects.toMatchObject({ code: "MATERIAL_HAS_CUSTOMER_DEMAND", message: expect.stringContaining("00000101") });
    expect(await new MaterialService({ em: em("prod") }).update(material.code, { active: false }, 1, actor)).toMatchObject({ active: false });
    await changeLine(lastId, { abandoned: "1.000000" });
    expect(await new MaterialService({ em: em() }).update(material.code, { active: false }, 1, actor)).toMatchObject({ active: false });
  });

  it("retains the original material lock when a stable line is changed to another material", async () => {
    const order = await service().create({ ...input(), lines: [line()] }, actor);
    const changes = edit(order); changes.lines[0].material = "00000004";
    const updated = await service().update(order.id, changes, 1, actor);
    expect(updated.lines).toHaveLength(1); expect(updated.lines[0]).toMatchObject({ id: order.lines[0].id, material: "00000004" });
    expect(await service().get(order.id)).toEqual(updated);
    expect(await em().count(CustomerOrderLine, { material: { code: "00000005" }, removed: true })).toBe(1);
    const materials = () => new MaterialService({ em: em() });
    await expect(materials().update("00000005", { type: "raw" }, 1, actor)).rejects.toMatchObject({ code: "MATERIAL_TYPE_IN_USE" });
    await expect(materials().update("00000005", { baseUnit: "kg" }, 1, actor)).rejects.toMatchObject({ code: "BASE_UNIT_IN_USE" });
    expect(await materials().update("00000005", { active: false }, 1, actor)).toMatchObject({ active: false });
  });

});
