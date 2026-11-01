import { PurchaseOrder, PurchaseOrderLine, PurchaseRequisition, type DocumentState, type EntityManager } from "@cpg/db";
import type { MrpPurchaseOrderLine, MrpRequisition } from "../../../domain/mrp/mrp-inputs";
import { yieldToEventLoop } from "../../../http/yield-to-event-loop";
import type { SnapshotCodes } from "./codes";
import { readRow, type UnreadableRows } from "./readable";

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
export async function readRequisitions(em: EntityManager, codes: SnapshotCodes, unreadable: UnreadableRows): Promise<MrpRequisition[]> {
  const requisitions: MrpRequisition[] = [];
  let cursor = "";
  for (;;) {
    const page = await em.find(
      PurchaseRequisition,
      { status: "open", code: { $gt: cursor } },
      {
        fields: ["code", "material", "location", "requiredDate", "quantity", "converted", "abandoned", "numerator", "denominator", "status"],
        orderBy: { code: "asc" },
        limit: REQUISITION_PAGE,
        disableIdentityMap: true,
      },
    );
    for (const row of page) {
      const pair = { material: codes.materials.get(row.material.id)!, location: codes.locations.get(row.location.id)! };
      const read = readRow({ quantities: { quantity: row.quantity, converted: row.converted, abandoned: row.abandoned }, factor: row, dates: [row.requiredDate] });
      if (!read) {
        unreadable.push({ ...pair, record: "purchase-requisition", document: row.code });
        continue;
      }
      // A plain `string(12)` column holding the shared lifecycle's states.
      requisitions.push({ code: row.code, ...pair, requiredDate: row.requiredDate, ...read, status: row.status as DocumentState });
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
export async function readPurchaseOrderLines(em: EntityManager, codes: SnapshotCodes, unreadable: UnreadableRows): Promise<MrpPurchaseOrderLine[]> {
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
          fields: ["order", "position", "material", "plannedDate", "quantity", "received", "abandoned", "numerator", "denominator", "status"],
          disableIdentityMap: true,
        },
      );
      for (const line of read) {
        const order = orders.get(line.order.id)!;
        const pair = { material: codes.materials.get(line.material.id)!, location: order.location };
        const read = readRow({ quantities: { quantity: line.quantity, received: line.received, abandoned: line.abandoned }, factor: line, dates: [line.plannedDate] });
        if (read) lines.push({ order: order.code, position: line.position, ...pair, plannedDate: line.plannedDate, ...read, status: line.status });
        else unreadable.push({ ...pair, record: "purchase-order-line", document: `${order.code}/${line.position}` });
      }
      await yieldToEventLoop();
    }
    if (headers.length < ORDER_PAGE) return lines;
    cursor = headers.at(-1)!.code;
  }
}
