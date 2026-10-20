import { mkdtempSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, selectTenant, Customer, Location, Material, StockMovement, Supplier, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import type { AuditActor } from "../audit/actor";
import { CustomerOrderService } from "../customer-orders/customer-order.service";
import { GOODS_RECEIPT_MOVEMENT, GoodsReceiptService } from "../goods-receipts/goods-receipt.service";
import { GoodsIssueService } from "../goods-issues/goods-issue.service";
import { PurchaseOrderService } from "../purchase-orders/purchase-order.service";
import { ShipmentService } from "../shipments/shipment.service";
import { TransferService } from "../transfers/transfer.service";
import { movementSources } from "./movement-sources";
import { StockService } from "./stock.service";

const ACTOR: AuditActor = { userId: "user-id", username: "alice", sessionId: "user-session", channel: "ui", token: null };
const WIDGET = "00000001";
const A = "00000001";
const B = "00000002";

describe("movement sources", () => {
  let orm: Orm;
  const scoped = () => {
    const em = orm.em.fork();
    selectTenant(em, "prod");
    return em;
  };
  const ledger = async (location = A) => (await new StockService({ em: scoped() }).get({ material: WIDGET, location })).movements;

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-movement-sources-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    const em = scoped();
    em.create(Material, { code: WIDGET, type: "finished", description: "Widget", baseUnit: "each" });
    em.create(Location, { code: A, name: "Main plant" });
    em.create(Location, { code: B, name: "Warehouse" });
    em.create(Supplier, { code: "00000001", name: "Steel Service" });
    em.create(Customer, { code: "00000001", name: "Retail" });
    await em.flush();
  });
  afterEach(() => orm.close());

  it("names each movement's document and the page that lists it: order, shipment, transfer; a correction is its own (INV-012)", async () => {
    await new StockService({ em: scoped() }).correct({ material: WIDGET, location: A, quantity: "5", unit: "each", reason: "Count" }, ACTOR);
    const purchase = await new PurchaseOrderService({ em: scoped() }).create(
      { supplier: "00000001", location: A, lines: [{ material: WIDGET, quantity: "40", unit: "each", plannedDate: "2026-10-13" }] }, ACTOR,
    );
    const receipt = await new GoodsReceiptService({ em: scoped() }).post({ purchaseOrder: purchase.id, lines: [{ line: 1, quantity: "40", unit: "each" }] }, ACTOR);
    const order = await new CustomerOrderService({ em: scoped() }).create(
      { customer: "00000001", location: A, lines: [{ material: WIDGET, quantity: "10", unit: "each", requiredDate: "2026-11-04" }] }, ACTOR,
    );
    const shipment = await new ShipmentService({ em: scoped() }).create(
      { customerOrder: order.id, plannedDate: "2026-11-03", lines: [{ orderLine: order.lines[0].id, quantity: "10", unit: "each" }] }, ACTOR,
    );
    const issue = await new GoodsIssueService({ em: scoped() }).post({ shipment: shipment.id, lines: [{ line: 1, quantity: "10", unit: "each" }] }, ACTOR);
    const transfers = new TransferService({ em: scoped() });
    const transfer = await transfers.create({ material: WIDGET, source: A, destination: B, quantity: "8", unit: "each", plannedDispatch: "2026-10-19", plannedArrival: "2026-10-22" }, ACTOR);
    await transfers.dispatch(transfer.id, { quantity: "8", unit: "each" }, ACTOR);
    await new TransferService({ em: scoped() }).receive(transfer.id, { quantity: "3", unit: "each" }, ACTOR);

    const sources = Object.fromEntries((await ledger()).map(({ type, source }) => [type, source]));
    expect(sources).toEqual({
      correction: { id: null, document: null },
      "goods-receipt": { id: receipt.id, document: { type: "purchase-order", id: purchase.id } },
      "goods-issue": { id: issue.id, document: { type: "shipment", id: shipment.id } },
      "transfer-dispatch": { id: transfer.id, document: { type: "transfer", id: transfer.id } },
    });
    expect((await ledger(B)).map(({ type, source }) => [type, source])).toEqual([["transfer-receipt", { id: transfer.id, document: { type: "transfer", id: transfer.id } }]]);
  });

  it("asks nothing for corrections alone, and leaves out a movement whose document can't be found", async () => {
    const em = scoped();
    const orphan = em.create(StockMovement, {
      postingId: randomUUID(), position: 0, type: GOODS_RECEIPT_MOVEMENT, material: await em.findOneOrFail(Material, { code: WIDGET }),
      location: await em.findOneOrFail(Location, { code: A }), businessDate: "2026-10-20", quantity: "1.000000", baseUnit: "each",
      enteredQuantity: "1.000000", enteredUnit: "each", numerator: "1", denominator: "1", balanceBefore: "0.000000", balanceAfter: "1.000000",
      reason: "Lost document", actorUsername: "alice", channel: "ui",
    });
    await em.flush();

    expect(await movementSources(em, [])).toEqual(new Map());
    expect(await movementSources(em, [orphan])).toEqual(new Map());
    expect((await ledger())[0].source).toEqual({ id: null, document: null });
  });
});
