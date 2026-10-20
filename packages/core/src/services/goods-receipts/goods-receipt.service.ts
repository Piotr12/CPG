import { randomUUID } from "node:crypto";
import {
  GoodsReceipt,
  GoodsReceiptLine,
  OptimisticLockError,
  PurchaseOrderLine,
  UniqueConstraintViolationException,
  type EntityManager,
  type PurchaseOrder,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { afterReceipt, isLineReceived, type LineReceipt } from "../../domain/goods-receipts/receipt-quantity";
import { ConflictError, NotFoundError, ValidationError, versionConflict, type FieldErrors } from "../../http/errors";
import { QUANTITY_OUT_OF_RANGE_MESSAGE } from "../../validators/boms/bom-fields.schema";
import type { ReceiptCreateInput } from "../../validators/goods-receipts/goods-receipt.schema";
import { RECEIPT_LINE_ORDER_MESSAGE } from "../../validators/goods-receipts/goods-receipt.schema";
import { LINE_NO_SUCH_LINE_MESSAGE } from "../../validators/purchasing/purchasing-fields.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { lineError } from "../materials/line-error";
import { assertOrderOpen, findOrder } from "../purchase-orders/order-records";
import { postStockMovements } from "../stock/stock-posting";

/** The stock movement type a receipt posts (INV-012: every movement names its source). */
export const GOODS_RECEIPT_MOVEMENT = "goods-receipt";
export const RECEIPT_ID_RACE = "Another goods receipt was posted at the same moment. Try again.";

/** One line of a receipt as the screens and the API show it. */
export interface ReceiptLineView {
  /** The purchase-order line it is for, by its 1-based number. */
  line: number;
  material: string;
  /** The base-unit quantity, six decimals (R03). */
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
}

/** A receipt with its lines. `id` is its eight-digit business ID, `purchaseOrder` and `location` its order's. */
export interface ReceiptView {
  id: string;
  purchaseOrder: string;
  location: string;
  /** The business date it posted on, the date of its stock movements (INV-010). */
  businessDate: string;
  createdAt: Date;
  lines: ReceiptLineView[];
}

/** A receipt line that brought in more than was still outstanding (BUY-015): accepted, and reported. */
export interface ReceiptWarning {
  code: "OVER_RECEIPT";
  line: number;
  /** The base-unit quantity beyond the outstanding, six decimals. */
  excess: string;
}

/** A receipt just posted, with its warnings (spec Q5). */
export interface PostedReceiptView extends ReceiptView {
  warnings: ReceiptWarning[];
}

/** A receipt line ready to store: its order line, the converted quantity and the order line after it. */
interface ResolvedLine {
  orderLine: PurchaseOrderLine;
  record: BaseQuantity;
  after: LineReceipt;
}

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's goods receipts (E09-S02): what arrived against one purchase order. Resolved from a
 * tenant scope, so every read and write is that tenant's only (R05); any signed-in account posts.
 * Posting is one transaction (BUY-012, AUD-018): the receipt and its lines, each order line's
 * received quantity, the order's status, one stock movement per line at the order's location
 * through the ledger's posting primitive (INV-002), and the audit entries (R08). A receipt may be
 * partial, repeated or in excess (BUY-010, BUY-011, BUY-015); the order completes once every line
 * has received its quantity (BUY-016, LFC-009). Receipts are never changed.
 */
export class GoodsReceiptService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every receipt of the tenant, or of one purchase order (404 when this tenant has no such order), newest first. */
  async list(filter: { purchaseOrder?: string } = {}): Promise<ReceiptView[]> {
    const where = filter.purchaseOrder === undefined ? {} : { order: await findOrder(this.em, filter.purchaseOrder) };
    const receipts = await this.em.find(GoodsReceipt, where, { populate: ["order", "order.location"], orderBy: { code: "desc" } });
    return viewsOf(this.em, receipts);
  }

  /** One receipt; `GOODS_RECEIPT_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<ReceiptView> {
    const receipt = await this.em.findOne(GoodsReceipt, { code: id }, { populate: ["order", "order.location"] });
    if (!receipt) throw new NotFoundError("GOODS_RECEIPT_NOT_FOUND", `There is no goods receipt ${id} in this tenant.`);
    return (await viewsOf(this.em, [receipt]))[0];
  }

  /**
   * Posts a receipt against one Open purchase order (spec Q1–Q7). Every line is checked before
   * anything is written, and its field errors are collected into one `VALIDATION_FAILED` keyed
   * `lines.N.<field>`: a line of another order (BUY-013), a line number the order doesn't have, a
   * unit the material doesn't convert. Any refusal, here or in the posting, writes nothing.
   */
  async post(input: ReceiptCreateInput, actor: AuditActor): Promise<PostedReceiptView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findOrder(em, input.purchaseOrder, { refresh: true });
        assertOrderOpen(order);
        const orderLines = await em.find(PurchaseOrderLine, { order }, { populate: ["material"], orderBy: { position: "asc" }, refresh: true });
        const resolved = await resolveLines(em, order, orderLines, input);
        const code = nextSequentialId((await em.find(GoodsReceipt, {}, { orderBy: { code: "desc" }, limit: 1 }))[0]?.code ?? null, {
          code: "RECEIPT_IDS_EXHAUSTED",
          message: "This tenant has used every eight-digit goods receipt ID.",
        });
        const id = randomUUID();
        const [{ businessDate }] = await postStockMovements(
          em,
          {
            lines: resolved.map(({ orderLine, record }) => ({
              material: orderLine.material.code,
              location: order.location.code,
              quantity: record.enteredQuantity,
              unit: record.enteredUnit,
            })),
            reason: `Goods receipt ${code} for purchase order ${order.code}`,
          },
          { type: GOODS_RECEIPT_MOVEMENT, id },
          { kind: "user", actor },
        );
        const receipt = em.create(GoodsReceipt, { id, code, order, businessDate });
        resolved.forEach(({ orderLine, record }, position) => {
          const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
          em.create(GoodsReceiptLine, { receipt, position, orderLine, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator });
        });
        receive(em, order, orderLines, resolved, actor);
        recordTenantAudit(em, actor, {
          action: "goods-receipts.goods-receipt.posted",
          subject: { type: "GoodsReceipt", id: code, label: `${code} — purchase order ${order.code}` },
          before: null,
          after: { id: code, purchaseOrder: order.code, location: order.location.code, businessDate, lines: linesText(resolved) },
        });
        await em.flush();
        const [view] = await viewsOf(em, [receipt]);
        const warnings = resolved
          .filter(({ after }) => after.excess !== "0.000000")
          .map(({ orderLine, after }): ReceiptWarning => ({ code: "OVER_RECEIPT", line: orderLine.position, excess: after.excess }));
        return { ...view, warnings };
      });
    } catch (error) {
      // A racing receipt normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index and the order's version only catch what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(RECEIPT_ID_RACE, "RECEIPT_ID_RACE");
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }
}

/**
 * Matches each input line to its order line and converts its quantity, collecting every field error
 * before refusing (AUD-018). A new received total no stored quantity holds is an error on the line's quantity.
 */
async function resolveLines(
  em: EntityManager,
  order: PurchaseOrder,
  orderLines: readonly PurchaseOrderLine[],
  input: ReceiptCreateInput,
): Promise<ResolvedLine[]> {
  const errors: FieldErrors = {};
  const resolved: ResolvedLine[] = [];
  for (const [index, line] of input.lines.entries()) {
    const field = (name: string) => `lines.${index}.${name}`;
    if (line.purchaseOrder !== undefined && line.purchaseOrder !== order.code) {
      errors[field("purchaseOrder")] = [RECEIPT_LINE_ORDER_MESSAGE];
      continue;
    }
    const orderLine = orderLines.find(({ position }) => position === line.line);
    if (!orderLine) {
      errors[field("line")] = [LINE_NO_SUCH_LINE_MESSAGE];
      continue;
    }
    let record: BaseQuantity;
    try {
      record = await convertToBaseQuantity(em, orderLine.material, line);
    } catch (error) {
      const [name, message] = lineError(error);
      errors[field(name)] = [message];
      continue;
    }
    const after = afterReceipt(orderLine.quantity, orderLine.received, record.baseQuantity);
    if (!after) {
      errors[field("quantity")] = [QUANTITY_OUT_OF_RANGE_MESSAGE];
      continue;
    }
    resolved.push({ orderLine, record, after });
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return resolved;
}

/**
 * Adds each line's receipt to its order line, completes the order once every line is received in full
 * (BUY-016, LFC-009), advances its version (the order changed), and records the order's audit entry.
 */
function receive(em: EntityManager, order: PurchaseOrder, orderLines: readonly PurchaseOrderLine[], resolved: readonly ResolvedLine[], actor: AuditActor): void {
  const before: Record<string, string> = { status: order.status };
  const after: Record<string, string> = {};
  for (const { orderLine, after: line } of resolved) {
    before[`line${orderLine.position}Received`] = orderLine.received;
    after[`line${orderLine.position}Received`] = line.received;
    orderLine.received = line.received;
  }
  if (orderLines.every(({ quantity, received }) => isLineReceived(quantity, received))) order.status = "completed";
  after.status = order.status;
  order.updatedAt = new Date();
  const { code, supplier } = order;
  recordTenantAudit(em, actor, {
    action: "purchase-orders.purchase-order.received",
    subject: { type: "PurchaseOrder", id: code, label: `${code} — ${supplier.code} ${supplier.name}` },
    before,
    after,
  });
}

/** A receipt's lines as one audit text value: "1: 00000003 30.000000 each". */
function linesText(lines: readonly ResolvedLine[]): string {
  return lines.map(({ orderLine, record }) => `${orderLine.position}: ${orderLine.material.code} ${record.baseQuantity} ${orderLine.material.baseUnit}`).join("; ");
}

/** The receipts with their lines, in the order given. */
async function viewsOf(em: EntityManager, receipts: readonly GoodsReceipt[]): Promise<ReceiptView[]> {
  if (receipts.length === 0) return [];
  const lines = await em.find(
    GoodsReceiptLine,
    { receipt: { $in: [...receipts] } },
    { populate: ["orderLine", "orderLine.material"], orderBy: { position: "asc" } },
  );
  return receipts.map((receipt) => ({
    id: receipt.code,
    purchaseOrder: receipt.order.code,
    location: receipt.order.location.code,
    businessDate: receipt.businessDate,
    createdAt: receipt.createdAt,
    lines: lines
      .filter((line) => line.receipt.id === receipt.id)
      .map(({ orderLine, quantity, enteredQuantity, enteredUnit, numerator, denominator }) => ({
        line: orderLine.position,
        material: orderLine.material.code,
        quantity,
        enteredQuantity,
        enteredUnit,
        numerator,
        denominator,
      })),
  }));
}
