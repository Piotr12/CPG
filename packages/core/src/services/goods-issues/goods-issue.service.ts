import { documentState } from "../../domain/document-lifecycle/lifecycle";
import { randomUUID } from "node:crypto";
import {
  CustomerOrderLine,
  GoodsIssue,
  GoodsIssueLine,
  OptimisticLockError,
  ShipmentLine,
  type Shipment,
  UniqueConstraintViolationException,
  type CustomerOrder,
  type EntityManager,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { addQuantities, exceeds, isLineFulfilled, outstandingOf, toIssueOf } from "../../domain/goods-issues/issue-quantity";
import { ConflictError, NotFoundError, ValidationError, versionConflict, type FieldErrors } from "../../http/errors";
import {
  ISSUE_LINE_SHIPMENT_MESSAGE,
  ISSUE_NO_SUCH_LINE_MESSAGE,
  ISSUE_QUANTITY_MESSAGE,
  type IssueCreateInput,
} from "../../validators/goods-issues/goods-issue.schema";
import { DOCUMENT_PAGE_SIZE } from "../../validators/shipments/shipment.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { assertCustomerOrderOpen, findCustomerOrder } from "../customer-orders/order-records";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { lineError } from "../materials/line-error";
import { assertShipmentOpen, findShipment, groupBy } from "../shipments/shipment-records";
import { completeFinishedShipments } from "../shipments/shipment-usage";
import { postStockMovements, type PostingContext } from "../stock/stock-posting";
import { documentMovements, NO_MOVEMENT, type DocumentMovement } from "../stock/movement-reversals";

/** The stock movement type a goods issue posts (INV-012: every movement names its source). */
export const GOODS_ISSUE_MOVEMENT = "goods-issue";
export const ISSUE_ID_RACE = "Another goods issue was posted at the same moment. Try again.";

/** One line of a goods issue as the screens and the API show it. */
export interface IssueLineView extends DocumentMovement {
  /** The shipment line it issued, by its 1-based number. */
  line: number;
  /** The stable ID of the customer-order line it fulfilled. */
  orderLine: string;
  material: string;
  /** The base-unit quantity, six decimals (R03). */
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
}

/** A goods issue with its lines. `id` is its eight-digit business ID; `customerOrder` and `location` are its shipment's order's. */
export interface IssueView {
  id: string;
  shipment: string;
  customerOrder: string;
  location: string;
  /** The business date it posted on, the date of its stock movements (INV-010). */
  businessDate: string;
  createdAt: Date;
  lines: IssueLineView[];
}

/** An issue line ready to post: its shipment line and the converted quantity. */
interface ResolvedLine {
  shipmentLine: ShipmentLine;
  record: BaseQuantity;
}

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's goods issues (E08-S02): what left against one shipment. Resolved from a tenant scope,
 * so every read and write is that tenant's only (R05); any signed-in account posts. Posting is one
 * transaction (R09): the issue and its lines, one negative stock movement per line at the order's
 * location through the ledger's posting primitive (INV-003), each order line's fulfilled quantity and
 * status, the order's status, each shipment line's issued quantity, the statuses of the order's
 * shipments, and the audit entries (R08). An issue never goes beyond what is outstanding (SAL-012,
 * SAL-018) or beyond the stock on hand (INV-005). Issues are never changed.
 */
export class GoodsIssueService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /**
   * A page of the tenant's goods issues, or of one shipment's (404 when this tenant has no such
   * shipment), newest first, `DOCUMENT_PAGE_SIZE` to a page; a page past the last is empty.
   */
  async list(filter: { shipment?: string; page?: number } = {}): Promise<IssueView[]> {
    const where = filter.shipment === undefined ? {} : { shipment: await findShipment(this.em, filter.shipment) };
    const issues = await this.em.find(GoodsIssue, where, {
      populate: ["shipment", "shipment.order", "shipment.order.location"],
      orderBy: { code: "desc" },
      limit: DOCUMENT_PAGE_SIZE,
      offset: ((filter.page ?? 1) - 1) * DOCUMENT_PAGE_SIZE,
    });
    return viewsOf(this.em, issues);
  }

  /** One goods issue; `GOODS_ISSUE_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<IssueView> {
    const issue = await this.em.findOne(GoodsIssue, { code: id }, { populate: ["shipment", "shipment.order", "shipment.order.location"] });
    if (!issue) throw new NotFoundError("GOODS_ISSUE_NOT_FOUND", `There is no goods issue ${id} in this tenant.`);
    return (await viewsOf(this.em, [issue]))[0];
  }

  /**
   * Posts a goods issue against one Open shipment of an Open order (spec Q4–Q9). Every line is
   * checked before anything is written, and its field errors are collected into one
   * `VALIDATION_FAILED` keyed `lines.N.<field>`: a line of another shipment, a line number the
   * shipment doesn't have, a unit the material doesn't convert, a quantity above the line's to issue.
   * Too little stock is `INSUFFICIENT_STOCK`, from the posting. Any refusal writes nothing.
   */
  post(input: IssueCreateInput, actor: AuditActor): Promise<IssueView> {
    return this.postWith(input, { kind: "user", actor });
  }

  /**
   * The demo seed's issue, posted and stamped at `at` and unaudited. The same checks apply: a seed
   * issue beyond the shipment line's to-issue or the stock on hand is refused as `post` would.
   */
  seedDemo(input: IssueCreateInput, at: Date): Promise<IssueView> {
    return this.postWith(input, { kind: "seed", at });
  }

  private async postWith(input: IssueCreateInput, context: PostingContext): Promise<IssueView> {
    try {
      return await this.em.transactional(async (em) => {
        const shipment = await findShipment(em, input.shipment, { refresh: true });
        assertShipmentOpen(shipment);
        const order = await findCustomerOrder(em, shipment.order.code, { refresh: true });
        assertCustomerOrderOpen(order);
        // Every visible line of the order, fresh: the shipment's lines point at them, and completion needs them all.
        const orderLines = await em.find(CustomerOrderLine, { order, removed: false }, { populate: ["material"], orderBy: { position: "asc" }, refresh: true });
        const shipmentLines = await em.find(ShipmentLine, { shipment }, { orderBy: { position: "asc" }, refresh: true });
        const resolved = await resolveLines(em, shipment, shipmentLines, input);
        const code = nextSequentialId((await em.find(GoodsIssue, {}, { orderBy: { code: "desc" }, limit: 1 }))[0]?.code ?? null, {
          code: "ISSUE_IDS_EXHAUSTED",
          message: "This tenant has used every eight-digit goods issue ID.",
        });
        const id = randomUUID();
        const [{ businessDate }] = await postStockMovements(
          em,
          {
            lines: resolved.map(({ shipmentLine, record }) => ({
              material: shipmentLine.orderLine.material.code,
              location: order.location.code,
              quantity: `-${record.enteredQuantity}`,
              unit: record.enteredUnit,
            })),
            reason: `Goods issue ${code} for shipment ${shipment.code}, customer order ${order.code}`,
          },
          { type: GOODS_ISSUE_MOVEMENT, id },
          context,
        );
        const issue = em.create(GoodsIssue, { id, code, shipment, businessDate, ...(context.kind === "seed" && { createdAt: context.at }) });
        resolved.forEach(({ shipmentLine, record }, position) => {
          const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
          em.create(GoodsIssueLine, { issue, position, shipmentLine, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator });
        });
        fulfil(em, order, orderLines, resolved, context);
        issueShipment(em, shipment, order, resolved, context);
        await completeFinishedShipments(em, order, context);
        if (context.kind === "user") recordTenantAudit(em, context.actor, {
          action: "goods-issues.goods-issue.posted",
          subject: { type: "GoodsIssue", id: code, label: `${code} — shipment ${shipment.code}` },
          before: null,
          after: {
            id: code,
            shipment: shipment.code,
            customerOrder: order.code,
            location: order.location.code,
            businessDate,
            lines: resolved
              .map(({ shipmentLine, record }) => `${shipmentLine.position + 1}: ${shipmentLine.orderLine.material.code} ${record.baseQuantity} ${shipmentLine.orderLine.material.baseUnit}`)
              .join("; "),
          },
        });
        await em.flush();
        return (await viewsOf(em, [issue]))[0];
      });
    } catch (error) {
      // A racing issue normally surfaces as a stale snapshot, which the request wrappers retry; the
      // unique index and the order's version only catch what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(ISSUE_ID_RACE, "ISSUE_ID_RACE");
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }
}

/**
 * Matches each input line to its shipment line and converts its quantity, collecting every field
 * error before refusing. A quantity above the line's to issue is refused whatever the stock (SAL-018).
 */
async function resolveLines(em: EntityManager, shipment: Shipment, shipmentLines: readonly ShipmentLine[], input: IssueCreateInput): Promise<ResolvedLine[]> {
  const errors: FieldErrors = {};
  const resolved: ResolvedLine[] = [];
  for (const [index, line] of input.lines.entries()) {
    const field = (name: string) => `lines.${index}.${name}`;
    if (line.shipment !== undefined && line.shipment !== shipment.code) {
      errors[field("shipment")] = [ISSUE_LINE_SHIPMENT_MESSAGE];
      continue;
    }
    const shipmentLine = shipmentLines.find(({ position }) => position === line.line - 1);
    if (!shipmentLine) {
      errors[field("line")] = [ISSUE_NO_SUCH_LINE_MESSAGE];
      continue;
    }
    let record: BaseQuantity;
    try {
      record = await convertToBaseQuantity(em, shipmentLine.orderLine.material, line);
    } catch (error) {
      const [name, message] = lineError(error);
      errors[field(name)] = [message];
      continue;
    }
    if (exceeds(record.baseQuantity, toIssueOf(shipmentLine.quantity, shipmentLine.issued, outstandingOf(shipmentLine.orderLine)))) {
      errors[field("quantity")] = [ISSUE_QUANTITY_MESSAGE];
      continue;
    }
    resolved.push({ shipmentLine, record });
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return resolved;
}

/**
 * Adds each line's issue to its order line, completes the lines delivered in full and the order once
 * every line is (SAL-013, LFC-003, LFC-010), advances the order's version (it changed), and records
 * the order's audit entry.
 */
function fulfil(em: EntityManager, order: CustomerOrder, orderLines: readonly CustomerOrderLine[], resolved: readonly ResolvedLine[], context: PostingContext): void {
  const before: Record<string, string> = { status: order.status };
  const after: Record<string, string> = {};
  for (const { shipmentLine, record } of resolved) {
    const line = shipmentLine.orderLine;
    const number = line.position + 1;
    before[`line${number}Fulfilled`] = line.fulfilled;
    before[`line${number}Status`] = line.status;
    line.fulfilled = addQuantities(line.fulfilled, record.baseQuantity);
    if (isLineFulfilled(line)) line.status = "completed";
    after[`line${number}Fulfilled`] = line.fulfilled;
    after[`line${number}Status`] = line.status;
  }
  order.status = documentState(orderLines.map(({ status }) => status));
  after.status = order.status;
  if (context.kind === "seed") order.updatedAt = context.at;
  else order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
  if (context.kind === "user") recordTenantAudit(em, context.actor, {
    action: "customer-orders.customer-order.fulfilled",
    subject: { type: "CustomerOrder", id: order.code, label: `Customer order ${order.code}` },
    before,
    after,
  });
}

/** Adds each line's issue to its shipment line and records that shipment's audit entry. */
function issueShipment(em: EntityManager, shipment: Shipment, order: CustomerOrder, resolved: readonly ResolvedLine[], context: PostingContext): void {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const { shipmentLine, record } of resolved) {
    before[`line${shipmentLine.position + 1}Issued`] = shipmentLine.issued;
    shipmentLine.issued = addQuantities(shipmentLine.issued, record.baseQuantity);
    after[`line${shipmentLine.position + 1}Issued`] = shipmentLine.issued;
  }
  if (context.kind === "user") recordTenantAudit(em, context.actor, {
    action: "shipments.shipment.issued",
    subject: { type: "Shipment", id: shipment.code, label: `${shipment.code} — customer order ${order.code}` },
    before,
    after,
  });
}

/** The issues with their lines, in the order given. */
async function viewsOf(em: EntityManager, issues: readonly GoodsIssue[]): Promise<IssueView[]> {
  if (issues.length === 0) return [];
  const lines = await em.find(
    GoodsIssueLine,
    { issue: { $in: [...issues] } },
    { populate: ["shipmentLine", "shipmentLine.orderLine", "shipmentLine.orderLine.material"], orderBy: { position: "asc" } },
  );
  const byIssue = groupBy(lines, (line) => line.issue.id);
  const movements = await documentMovements(em, GOODS_ISSUE_MOVEMENT, issues.map(({ id }) => id));
  return issues.map((issue) => ({
    id: issue.code,
    shipment: issue.shipment.code,
    customerOrder: issue.shipment.order.code,
    location: issue.shipment.order.location.code,
    businessDate: issue.businessDate,
    createdAt: issue.createdAt,
    lines: byIssue
      .get(issue.id)!
      .map(({ position, shipmentLine, quantity, enteredQuantity, enteredUnit, numerator, denominator }) => ({
        ...(movements.get(`${issue.id}:${position}`) ?? NO_MOVEMENT),
        line: shipmentLine.position + 1,
        orderLine: shipmentLine.orderLine.id,
        material: shipmentLine.orderLine.material.code,
        quantity,
        enteredQuantity,
        enteredUnit,
        numerator,
        denominator,
      })),
  }));
}
