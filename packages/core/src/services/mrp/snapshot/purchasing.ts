import { PurchaseOrder, PurchaseOrderLine, PurchaseRequisition, type DocumentState, type EntityManager } from "@cpg/db";
import type { MrpPurchaseOrderLine, MrpRequisition } from "../../../domain/mrp/mrp-inputs";
import { parseDecimal } from "../../../domain/quantities/decimal";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";

/** Requisitions per read: one row each, so a read hydrates at most this many (about 17 ms). */
export const REQUISITION_PAGE = 1_000;
/** Open purchase-order headers per read. */
export const ORDER_PAGE = 100;
/**
 * Orders whose lines one read takes. An order holds at most 100 lines (`ORDER_LINES_MAX`), so a read
 * hydrates at most 1,000 rows whatever the orders hold: a chunk is sized by the rows it hydrates, not
 * by its keys (lesson 2026-10-25, "A read of thousands of rows costs hydration").
 */
export const ORDER_LINE_CHUNK = 10;

/**
 * The tenant's Open requisitions, overdue ones and those past the horizon included (the engine places
 * and drops them), by business ID. Each page seeks the `(tenant, status, code)` list index from the
 * last code read, then yields, so a large tenant never stalls the server.
 */
export async function readRequisitions(em: EntityManager, codes: SnapshotCodes): Promise<MrpRequisition[]> {
  const requisitions: MrpRequisition[] = [];
  let cursor = "";
  for (;;) {
    const page = await em.find(
      PurchaseRequisition,
      { status: "open", code: { $gt: cursor } },
      {
        fields: ["code", "material", "location", "requiredDate", "quantity", "converted", "abandoned", "status"],
        orderBy: { code: "asc" },
        limit: REQUISITION_PAGE,
        disableIdentityMap: true,
      },
    );
    for (const row of page) {
      requisitions.push({
        code: row.code,
        material: codes.materials.get(row.material.id)!,
        location: codes.locations.get(row.location.id)!,
        requiredDate: row.requiredDate,
        quantity: parseDecimal(row.quantity)!,
        converted: parseDecimal(row.converted)!,
        abandoned: parseDecimal(row.abandoned)!,
        // A plain `string(12)` column holding the shared lifecycle's states.
        status: row.status as DocumentState,
      });
    }
    await yieldToEventLoop();
    if (page.length < REQUISITION_PAGE) return requisitions;
    cursor = page.at(-1)!.code;
  }
}

/**
 * The Open lines of the tenant's Open purchase orders, with each order's ID and location (BUY-006). An
 * Open line always sits under an Open header (`documentState`), and `purchase_order_line` has no index
 * on its own status, so the read pages Open headers through `(tenant, status, code)` and then reads
 * their lines through `(tenant, order)`, `ORDER_LINE_CHUNK` orders at a time, yielding after each read.
 */
export async function readPurchaseOrderLines(em: EntityManager, codes: SnapshotCodes): Promise<MrpPurchaseOrderLine[]> {
  const lines: MrpPurchaseOrderLine[] = [];
  let cursor = "";
  for (;;) {
    const headers = await em.find(
      PurchaseOrder,
      { status: "open", code: { $gt: cursor } },
      { fields: ["code", "location"], orderBy: { code: "asc" }, limit: ORDER_PAGE, disableIdentityMap: true },
    );
    await yieldToEventLoop();
    const orders = new Map(headers.map(({ id, code, location }) => [id, { code, location: codes.locations.get(location.id)! }]));
    const ids = [...orders.keys()];
    for (let start = 0; start < ids.length; start += ORDER_LINE_CHUNK) {
      const read = await em.find(
        PurchaseOrderLine,
        { order: { $in: ids.slice(start, start + ORDER_LINE_CHUNK) }, status: "open" },
        {
          fields: ["order", "position", "material", "plannedDate", "quantity", "received", "abandoned", "status"],
          disableIdentityMap: true,
        },
      );
      for (const line of read) {
        const order = orders.get(line.order.id)!;
        lines.push({
          order: order.code,
          position: line.position,
          material: codes.materials.get(line.material.id)!,
          location: order.location,
          plannedDate: line.plannedDate,
          quantity: parseDecimal(line.quantity)!,
          received: parseDecimal(line.received)!,
          abandoned: parseDecimal(line.abandoned)!,
          status: line.status,
        });
      }
      await yieldToEventLoop();
    }
    if (headers.length < ORDER_PAGE) return lines;
    cursor = headers.at(-1)!.code;
  }
}
