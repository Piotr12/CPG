import {
  CustomerOrderLine,
  Shipment,
  ShipmentLine,
  UniqueConstraintViolationException,
  type CustomerOrder,
  type EntityManager,
  type ShipmentStatus,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { exceeds, outstandingOf, toIssueOf } from "../../domain/goods-issues/issue-quantity";
import { ConflictError, ValidationError, type FieldErrors } from "../../http/errors";
import {
  SHIPMENT_LINE_ORDER_MESSAGE,
  SHIPMENT_NO_SUCH_LINE_MESSAGE,
  SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE,
  type ShipmentCreateInput,
} from "../../validators/shipments/shipment.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { assertCustomerOrderOpen, findCustomerOrder } from "../customer-orders/order-records";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { lineError } from "../materials/line-error";
import { findShipment } from "./shipment-records";

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
  createdAt: Date;
  lines: ShipmentLineView[];
}

/** A shipment line ready to store: its order line and the converted planned quantity. */
interface ResolvedLine {
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

  /** Every shipment of the tenant, or of one customer order (404 when this tenant has no such order), newest first. */
  async list(filter: { customerOrder?: string } = {}): Promise<ShipmentView[]> {
    const where = filter.customerOrder === undefined ? {} : { order: await findCustomerOrder(this.em, filter.customerOrder) };
    const shipments = await this.em.find(Shipment, where, { populate: ["order", "order.customer", "order.location"], orderBy: { code: "desc" } });
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
  async create(input: ShipmentCreateInput, actor: AuditActor): Promise<ShipmentView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findCustomerOrder(em, input.customerOrder, { refresh: true });
        assertCustomerOrderOpen(order);
        const orderLines = await em.find(CustomerOrderLine, { order, removed: false }, { populate: ["material"], orderBy: { position: "asc" }, refresh: true });
        const resolved = await resolveLines(em, order, orderLines, input);
        const code = nextSequentialId((await em.find(Shipment, {}, { orderBy: { code: "desc" }, limit: 1 }))[0]?.code ?? null, {
          code: "SHIPMENT_IDS_EXHAUSTED",
          message: "This tenant has used every eight-digit shipment ID.",
        });
        const shipment = em.create(Shipment, { code, order, plannedDate: input.plannedDate });
        resolved.forEach(({ orderLine, record }, position) => {
          const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
          em.create(ShipmentLine, { shipment, position, orderLine, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator });
        });
        recordTenantAudit(em, actor, {
          action: "shipments.shipment.created",
          subject: { type: "Shipment", id: code, label: `${code} — customer order ${order.code}` },
          before: null,
          after: {
            id: code,
            customerOrder: order.code,
            location: order.location.code,
            plannedDate: input.plannedDate,
            status: shipment.status,
            lines: resolved.map(({ orderLine, record }, index) => `${index + 1}: ${orderLine.material.code} ${record.baseQuantity} ${orderLine.material.baseUnit}`).join("; "),
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

/** Matches each input line to its order line and converts its quantity, collecting every field error before refusing. */
async function resolveLines(
  em: EntityManager,
  order: CustomerOrder,
  orderLines: readonly CustomerOrderLine[],
  input: ShipmentCreateInput,
): Promise<ResolvedLine[]> {
  const errors: FieldErrors = {};
  const resolved: ResolvedLine[] = [];
  for (const [index, line] of input.lines.entries()) {
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
    let record: BaseQuantity;
    try {
      record = await convertToBaseQuantity(em, orderLine.material, line);
    } catch (error) {
      const [name, message] = lineError(error);
      errors[field(name)] = [message];
      continue;
    }
    if (exceeds(record.baseQuantity, outstandingOf(orderLine))) {
      errors[field("quantity")] = [SHIPMENT_QUANTITY_OUTSTANDING_MESSAGE];
      continue;
    }
    resolved.push({ orderLine, record });
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return resolved;
}

/** The shipments with their lines, in the order given. */
async function viewsOf(em: EntityManager, shipments: readonly Shipment[]): Promise<ShipmentView[]> {
  if (shipments.length === 0) return [];
  const lines = await em.find(
    ShipmentLine,
    { shipment: { $in: [...shipments] } },
    { populate: ["orderLine", "orderLine.material"], orderBy: { position: "asc" } },
  );
  return shipments.map((shipment) => ({
    id: shipment.code,
    customerOrder: shipment.order.code,
    customer: shipment.order.customer.code,
    location: shipment.order.location.code,
    plannedDate: shipment.plannedDate,
    status: shipment.status,
    createdAt: shipment.createdAt,
    lines: lines
      .filter((line) => line.shipment.id === shipment.id)
      .map(({ position, orderLine, quantity, enteredQuantity, enteredUnit, numerator, denominator, issued }) => ({
        line: position + 1,
        orderLine: orderLine.id,
        material: orderLine.material.code,
        quantity,
        enteredQuantity,
        enteredUnit,
        numerator,
        denominator,
        issued,
        toIssue: toIssueOf(quantity, issued, outstandingOf(orderLine)),
      })),
  }));
}
