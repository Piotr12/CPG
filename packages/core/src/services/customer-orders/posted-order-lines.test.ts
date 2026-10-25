import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  Customer, CustomerOrder, CustomerOrderLine, GoodsIssue, GoodsIssueLine, Location, Material, Shipment, ShipmentLine,
  initOrm, selectTenant, type EntityManager, type Orm,
} from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { postedOrderLineIds } from "./posted-order-lines";

const QUANTITY = { quantity: "1.000000", enteredQuantity: "1", enteredUnit: "each", numerator: "1", denominator: "1" };
/** A UUID that sorts by `index`, so a test decides which shipment line a keyset batch reads last. */
const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

describe("postedOrderLineIds", () => {
  let orm: Orm;
  let em: EntityManager;
  let order: CustomerOrder;
  let material: Material;

  /** `count` lines of the order. */
  const orderLines = (count: number) =>
    Array.from({ length: count }, (_, position) => em.create(CustomerOrderLine, { order, position, material, ...QUANTITY, requiredDate: "2027-01-01" }));
  const shipment = () => em.create(Shipment, { code: "00000001", order, plannedDate: "2027-01-01" });
  const issue = (shipmentLine: ShipmentLine) => {
    const issued = em.create(GoodsIssue, { code: shipmentLine.id.slice(-8), shipment: shipmentLine.shipment, businessDate: "2027-01-01" });
    em.create(GoodsIssueLine, { issue: issued, position: 0, shipmentLine, ...QUANTITY });
  };

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-posted-order-lines-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    em = orm.em.fork();
    selectTenant(em, "test");
    material = em.create(Material, { code: "00000001", description: "Widget", baseUnit: "each", type: "finished" });
    const customer = em.create(Customer, { code: "00000001", name: "Retail" });
    const location = em.create(Location, { code: "00000001", name: "Main plant" });
    order = em.create(CustomerOrder, { code: "00000001", customer, location });
  });
  afterEach(() => orm.close());

  it("finds an issued order line behind a full batch of unissued shipment lines, and leaves the unissued one out", async () => {
    const [busy, quiet] = orderLines(2);
    const planned = shipment();
    // 150 shipment lines of one order line; only the last one by UUID, past the first batch of 100, was issued.
    const lines = Array.from({ length: 150 }, (_, position) => em.create(ShipmentLine, { id: uuid(position + 1), shipment: planned, position, orderLine: busy, ...QUANTITY }));
    em.create(ShipmentLine, { id: uuid(500), shipment: planned, position: 150, orderLine: quiet, ...QUANTITY });
    issue(lines.at(-1)!);
    await em.flush();

    expect(await postedOrderLineIds(em.fork(), [busy, quiet])).toEqual(new Set([busy.id]));
  });

  it("checks more order lines than one batch holds, and a line never shipped is not posted", async () => {
    const lines = orderLines(102);
    const planned = shipment();
    lines.slice(0, 101).forEach((orderLine, position) => issue(em.create(ShipmentLine, { id: uuid(position + 1), shipment: planned, position, orderLine, ...QUANTITY })));
    await em.flush();

    expect(await postedOrderLineIds(em.fork(), lines)).toEqual(new Set(lines.slice(0, 101).map(({ id }) => id)));
    expect(await postedOrderLineIds(em.fork(), [])).toEqual(new Set());
  });
});
