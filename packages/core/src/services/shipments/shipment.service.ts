import {
  CustomerOrderLine,
  GoodsIssue,
  OptimisticLockError,
  Shipment,
  ShipmentLine,
  UniqueConstraintViolationException,
  type CustomerOrder,
  type EntityManager,
  type ShipmentStatus,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { addQuantities, exceeds, outstandingOf, toIssueOf } from "../../domain/goods-issues/issue-quantity";
import { parseDecimal } from "../../domain/quantities/decimal";
import { ConflictError, ValidationError, versionConflict, type FieldErrors } from "../../http/errors";
import { validationError } from "../../http/parse-input";
import {
  SHIPMENT_LINE_ORDER_MESSAGE,
  SHIPMENT_NO_SUCH_LINE_MESSAGE,
  DOCUMENT_PAGE_SIZE,
  SHIPMENT_QUANTITY_ISSUED_MESSAGE,
  SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE,
  shipmentUpdateSchema,
  type ShipmentChanges,
  type ShipmentCreateInput,
} from "../../validators/shipments/shipment.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { assertCustomerOrderOpen, findCustomerOrder } from "../customer-orders/order-records";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { lineError } from "../materials/line-error";
import type { PostingContext } from "../stock/stock-posting";
import { assertShipmentOpen, findShipment, groupBy, postedShipmentLineIds } from "./shipment-records";
import { completeFinishedShipments, touchShipment } from "./shipment-usage";

/** A six-decimal zero (R03): what a cancelled shipment's lines have left to issue. */
const NOTHING = "0.000000";

export const SHIPMENT_ID_RACE = "Another shipment was created at the same moment. Try again.";

/** One line of a shipment as the screens and the API show it. Quantities are six-decimal base-unit text (R03). */
export interface ShipmentLineView {
  /** Its 1-based number in the shipment, which a goods issue names. */
  line: number;
  /** The stable ID of the customer-order line it ships. */
  orderLine: string;
  material: string;
  /** The base quantity planned to go. */
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
  /** What its goods issues have issued so far. */
  issued: string;
  /** Whether any goods issue ever named it, even one reversed since: such a line can't be removed (shipment edit spec Q9). */
  posted: boolean;
  /** What a goods issue may still issue on it: the plan's remainder, at most the order line's outstanding (spec Q5). */
  toIssue: string;
}

/** A shipment with its lines. `id` is its eight-digit business ID; `customer` and `location` are its order's. */
export interface ShipmentView {
  id: string;
  customerOrder: string;
  customer: string;
  location: string;
  plannedDate: string;
  status: ShipmentStatus;
  /** The version an edit or a cancel must name; it advances on every change the shipment's page shows (shipment edit spec Q5). */
  version: number;
  createdAt: Date;
  lines: ShipmentLineView[];
}

/** A shipment line ready to store: the line it keeps (none for a new one), its order line and the converted planned quantity. */
interface ResolvedLine {
  existing?: ShipmentLine;
  orderLine: CustomerOrderLine;
  record: BaseQuantity;
}

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's shipments (E08-S02): planned dispatches against one customer order. Resolved from a
 * tenant scope, so every read and write is that tenant's only (R05); any signed-in account creates
 * them. A shipment moves no stock and fulfils nothing (SAL-009): its goods issues do.
 */
export class ShipmentService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /**
   * A page of the tenant's shipments, or of one customer order's (404 when this tenant has no such
   * order), newest first, `DOCUMENT_PAGE_SIZE` to a page; a page past the last is empty.
   */
  async list(filter: { customerOrder?: string; page?: number } = {}): Promise<ShipmentView[]> {
    const where = filter.customerOrder === undefined ? {} : { order: await findCustomerOrder(this.em, filter.customerOrder) };
    const shipments = await this.em.find(Shipment, where, {
      populate: ["order", "order.customer", "order.location"],
      orderBy: { code: "desc" },
      limit: DOCUMENT_PAGE_SIZE,
      offset: ((filter.page ?? 1) - 1) * DOCUMENT_PAGE_SIZE,
    });
    return viewsOf(this.em, shipments);
  }

  /** One shipment; `SHIPMENT_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<ShipmentView> {
    return (await viewsOf(this.em, [await findShipment(this.em, id)]))[0];
  }

  /**
   * Creates a shipment against one Open customer order (spec Q1–Q3). Every line is checked before
   * anything is written, and its field errors are collected into one `VALIDATION_FAILED` keyed
   * `lines.N.<field>`: a line of another order (SAL-008), an ID that isn't a line of this order, a
   * unit the material doesn't convert, a quantity above the order line's outstanding.
   */
  create(input: ShipmentCreateInput, actor: AuditActor): Promise<ShipmentView> {
    return this.createWith(input, { kind: "user", actor });
  }

  /** The demo seed's shipment, stamped at `at` and unaudited; every business rule of `create` still applies. */
  seedDemo(input: ShipmentCreateInput, at: Date): Promise<ShipmentView> {
    return this.createWith(input, { kind: "seed", at });
  }

  /**
   * Replaces an Open shipment's planned date and line set at the `version` the caller loaded (shipment
   * edit spec Q2–Q5, Q9): a listed order line it already ships keeps its line, a new one adds a line
   * numbered from `nextLine`, and a line left out is removed, unless a goods issue ever named it
   * (`SHIPMENT_LINE_ISSUED`). An edit that changes nothing records nothing and keeps the version. One
   * that leaves no line anything to issue completes the shipment in the same transaction.
   */
  async update(id: string, input: ShipmentChanges, version: number, actor: AuditActor): Promise<ShipmentView> {
    const parsed = shipmentUpdateSchema.safeParse({ ...input, version });
    if (!parsed.success) throw validationError(parsed.error);
    const changes = parsed.data;
    try {
      return await this.em.transactional(async (em) => {
        const shipment = await findShipment(em, id, { refresh: true });
        if (shipment.version !== version) throw versionConflict();
        assertShipmentOpen(shipment, "change");
        const { order } = shipment;
        const orderLines = await em.find(CustomerOrderLine, { order, removed: false }, { populate: ["material"], orderBy: { position: "asc" }, refresh: true });
        const current = await em.find(ShipmentLine, { shipment }, { populate: ["orderLine", "orderLine.material"], orderBy: { position: "asc" }, refresh: true });
        const resolved = await resolveLines(em, order, orderLines, current, changes.lines);
        const removed = current.filter((line) => !resolved.some(({ existing }) => existing === line));
        const issued = await postedShipmentLineIds(em, removed);
        const lost = removed.find(({ id }) => issued.has(id));
        if (lost) {
          throw new ConflictError(
            `Line ${lost.position + 1} has goods issued against it, so it stays on the shipment. Lower it to what was issued instead.`,
            "SHIPMENT_LINE_ISSUED",
            { line: String(lost.position + 1) },
          );
        }
        const isChanged = shipment.plannedDate !== changes.plannedDate || removed.length > 0 ||
          resolved.some((line) => !line.existing || isLineChanged(line.existing, line));
        if (!isChanged) return (await viewsOf(em, [shipment]))[0];
        const before = planSnapshot(shipment, current);
        let next = Math.max(shipment.nextLine, ...current.map(({ position }) => position + 1));
        const saved = resolved.map(({ existing, orderLine, record }) => {
          const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
          const fields = { quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator };
          return existing ? em.assign(existing, fields) : em.create(ShipmentLine, { shipment, position: next++, orderLine, ...fields });
        });
        removed.forEach((line) => em.remove(line));
        shipment.plannedDate = changes.plannedDate;
        shipment.nextLine = next;
        touchShipment(shipment);
        recordTenantAudit(em, actor, {
          action: "shipments.shipment.updated",
          subject: subject(shipment),
          before,
          after: planSnapshot(shipment, [...saved].sort((a, b) => a.position - b.position)),
        });
        // Flushed before the completion check, whose refreshing read would discard unflushed header changes.
        await em.flush();
        await completeFinishedShipments(em, order, { kind: "user", actor });
        await em.flush();
        return (await viewsOf(em, [shipment]))[0];
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /**
   * Cancels an Open shipment at the `version` the caller loaded, when no goods issue was ever posted
   * against it, even one reversed since (shipment edit spec Q6): it plans nothing more. It reserved no
   * stock and fulfilled nothing, so nothing else changes. A partly issued shipment is finished by
   * lowering its lines to what was issued instead (`SHIPMENT_ISSUED`).
   */
  async cancel(id: string, version: number, actor: AuditActor): Promise<ShipmentView> {
    try {
      return await this.em.transactional(async (em) => {
        const shipment = await findShipment(em, id, { refresh: true });
        if (shipment.version !== version) throw versionConflict();
        assertShipmentOpen(shipment, "cancel");
        if ((await em.count(GoodsIssue, { shipment })) > 0) {
          throw new ConflictError(
            `Goods have been issued against shipment ${shipment.code}, so it can't be cancelled. To finish it, lower its lines to what was issued.`,
            "SHIPMENT_ISSUED",
          );
        }
        shipment.status = "cancelled";
        recordTenantAudit(em, actor, { action: "shipments.shipment.cancelled", subject: subject(shipment), before: { status: "open" }, after: { status: shipment.status } });
        await em.flush();
        return (await viewsOf(em, [shipment]))[0];
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  private async createWith(input: ShipmentCreateInput, context: PostingContext): Promise<ShipmentView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findCustomerOrder(em, input.customerOrder, { refresh: true });
        assertCustomerOrderOpen(order);
        const orderLines = await em.find(CustomerOrderLine, { order, removed: false }, { populate: ["material"], orderBy: { position: "asc" }, refresh: true });
        const resolved = await resolveLines(em, order, orderLines, [], input.lines);
        const code = nextSequentialId((await em.find(Shipment, {}, { orderBy: { code: "desc" }, limit: 1 }))[0]?.code ?? null, {
          code: "SHIPMENT_IDS_EXHAUSTED",
          message: "This tenant has used every eight-digit shipment ID.",
        });
        const shipment = em.create(Shipment, {
          code,
          order,
          plannedDate: input.plannedDate,
          nextLine: resolved.length,
          ...(context.kind === "seed" && { createdAt: context.at, updatedAt: context.at }),
        });
        resolved.forEach(({ orderLine, record }, position) => {
          const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
          em.create(ShipmentLine, { shipment, position, orderLine, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator });
        });
        if (context.kind === "user") recordTenantAudit(em, context.actor, {
          action: "shipments.shipment.created",
          subject: { type: "Shipment", id: code, label: `${code} — customer order ${order.code}` },
          before: null,
          after: {
            id: code,
            customerOrder: order.code,
            location: order.location.code,
            plannedDate: input.plannedDate,
            status: shipment.status,
            lines: resolved.map(({ orderLine, record }, index) => planned(index, orderLine, record.baseQuantity)).join("; "),
          },
        });
        await em.flush();
        return (await viewsOf(em, [shipment]))[0];
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(SHIPMENT_ID_RACE, "SHIPMENT_ID_RACE");
      throw error;
    }
  }
}

/**
 * Matches each input line to its order line, and to the shipment line already shipping it among
 * `current` (none on create), and converts its quantity, collecting every field error before refusing
 * (shipment edit spec Q2, Q4). A kept line whose entered quantity and unit are unchanged keeps its
 * stored conversion. A new line can't plan more than its order line still has outstanding (spec Q3);
 * a kept line never goes below what it issued, and when raised, never leaves more to issue than that.
 */
async function resolveLines(
  em: EntityManager,
  order: CustomerOrder,
  orderLines: readonly CustomerOrderLine[],
  current: readonly ShipmentLine[],
  inputs: ShipmentCreateInput["lines"],
): Promise<ResolvedLine[]> {
  const errors: FieldErrors = {};
  const resolved: ResolvedLine[] = [];
  for (const [index, line] of inputs.entries()) {
    const field = (name: string) => `lines.${index}.${name}`;
    if (line.customerOrder !== undefined && line.customerOrder !== order.code) {
      errors[field("customerOrder")] = [SHIPMENT_LINE_ORDER_MESSAGE];
      continue;
    }
    const orderLine = orderLines.find(({ id }) => id === line.orderLine);
    if (!orderLine) {
      errors[field("orderLine")] = [SHIPMENT_NO_SUCH_LINE_MESSAGE];
      continue;
    }
    const existing = current.find((shipped) => shipped.orderLine.id === orderLine.id);
    let record: BaseQuantity;
    try {
      record = existing && isUnchanged(existing, line) ? storedRecord(existing) : await convertToBaseQuantity(em, orderLine.material, line);
    } catch (error) {
      const [name, message] = lineError(error);
      errors[field(name)] = [message];
      continue;
    }
    const outstanding = outstandingOf(orderLine);
    const message = !existing
      ? exceeds(record.baseQuantity, outstanding) && SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE
      : exceeds(existing.issued, record.baseQuantity)
        ? SHIPMENT_QUANTITY_ISSUED_MESSAGE
        : exceeds(record.baseQuantity, existing.quantity) && exceeds(record.baseQuantity, addQuantities(existing.issued, outstanding)) && SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE;
    if (message) {
      errors[field("quantity")] = [message];
      continue;
    }
    resolved.push({ existing, orderLine, record });
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return resolved;
}

/** Whether an edit sent a kept line's entered quantity and unit as stored: equal decimals, so "20" is "20.000000". */
function isUnchanged(line: ShipmentLine, input: { quantity: string; unit: string }): boolean {
  return line.enteredUnit === input.unit && parseDecimal(line.enteredQuantity) === parseDecimal(input.quantity);
}

function storedRecord({ quantity, enteredQuantity, enteredUnit, numerator, denominator }: ShipmentLine): BaseQuantity {
  return { baseQuantity: quantity, enteredQuantity, enteredUnit, numerator, denominator };
}

/** One line of the audit's readable plan: `N: material quantity unit`, numbered from 1. */
function planned(position: number, orderLine: CustomerOrderLine, quantity: string): string {
  return `${position + 1}: ${orderLine.material.code} ${quantity} ${orderLine.material.baseUnit}`;
}

/** The audit's allowlisted view of a shipment's plan. */
function planSnapshot(shipment: Shipment, lines: readonly ShipmentLine[]) {
  return {
    plannedDate: shipment.plannedDate,
    status: shipment.status,
    lines: lines.map(({ position, orderLine, quantity }) => planned(position, orderLine, quantity)).join("; "),
  };
}

/** Whether a kept line's stored plan differs from what an edit resolved for it. */
function isLineChanged(line: ShipmentLine, { record }: ResolvedLine): boolean {
  return line.quantity !== record.baseQuantity || line.enteredQuantity !== record.enteredQuantity || line.enteredUnit !== record.enteredUnit;
}

function subject(shipment: Shipment) {
  return { type: "Shipment", id: shipment.code, label: `${shipment.code} — customer order ${shipment.order.code}` };
}

/** The shipments with their lines, in the order given. */
async function viewsOf(em: EntityManager, shipments: readonly Shipment[]): Promise<ShipmentView[]> {
  if (shipments.length === 0) return [];
  const lines = await em.find(
    ShipmentLine,
    { shipment: { $in: [...shipments] } },
    { populate: ["orderLine", "orderLine.material"], orderBy: { position: "asc" } },
  );
  const byShipment = groupBy(lines, (line) => line.shipment.id);
  const posted = await postedShipmentLineIds(em, lines);
  return shipments.map((shipment) => ({
    id: shipment.code,
    customerOrder: shipment.order.code,
    customer: shipment.order.customer.code,
    location: shipment.order.location.code,
    plannedDate: shipment.plannedDate,
    status: shipment.status,
    version: shipment.version,
    createdAt: shipment.createdAt,
    lines: byShipment
      .get(shipment.id)!
      .map(({ id, position, orderLine, quantity, enteredQuantity, enteredUnit, numerator, denominator, issued }) => ({
        line: position + 1,
        orderLine: orderLine.id,
        material: orderLine.material.code,
        quantity,
        enteredQuantity,
        enteredUnit,
        numerator,
        denominator,
        issued,
        posted: posted.has(id),
        // A cancelled shipment plans nothing more (shipment edit spec Q6), so nothing is left to issue on it.
        toIssue: shipment.status === "cancelled" ? NOTHING : toIssueOf(quantity, issued, outstandingOf(orderLine)),
      })),
  }));
}
