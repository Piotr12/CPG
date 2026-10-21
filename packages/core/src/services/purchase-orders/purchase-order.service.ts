import {
  OptimisticLockError,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseRequisition,
  UniqueConstraintViolationException,
  type EntityManager,
  type Material,
} from "@cpg/db";
import { nextSequentialId, formatSequentialId } from "../../domain/business-ids/sequential-id";
import { documentState, outstandingQuantity as unresolvedQuantity, resolveLines as resolveLifecycle, type DocumentState, type LifecycleAction } from "../../domain/document-lifecycle/lifecycle";
import { selectLifecycleLines } from "../../domain/document-lifecycle/select-lines";
import { DEMO_ORDERS } from "../../domain/purchasing/demo-purchasing";
import { addQuantities, afterConversion, fitsOutstanding, outstandingQuantity } from "../../domain/purchasing/requisition-quantity";
import { AppError, ConflictError, ValidationError, versionConflict, type FieldErrors } from "../../http/errors";
import {
  LINE_NO_SUCH_LINE_MESSAGE,
  LINE_LOCATION_MESSAGE,
  LINE_REQUISITION_LOCATION_MESSAGE,
  LINE_REQUISITION_MATERIAL_MESSAGE,
} from "../../validators/purchasing/purchasing-fields.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { lineError } from "../materials/line-error";
import { assertOrderOpen, findOrder, orderLineState } from "./order-records";
import { findRequisition, requisitionEntry, requisitionSnapshot } from "../purchase-requisitions/requisition-records";
import { findActiveSupplier } from "../suppliers/find-supplier";
import { isScopeReadOnly } from "../tenants/tenant.service";

/** One line of an order as the screens and the API show it. `line` is its 1-based number. */
export interface OrderLineView {
  line: number;
  material: string;
  /** The base-unit quantity, six decimals (R03). */
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
  plannedDate: string;
  /** The requisition this line converted, or null (BUY-002, BUY-003). */
  requisition: string | null;
  /** What goods receipts have brought in, six decimals; it may exceed `quantity` (BUY-015). */
  received: string;
  /** What is still awaited, six decimals, never negative. */
  outstanding: string;
  /** `completed` once the line has received at least its quantity (BUY-016). */
  status: DocumentState;
  abandoned: string;
}

/** An order with its lines. `id` is its eight-digit business ID; `supplier` and `location` are theirs. */
export interface OrderView {
  id: string;
  supplier: string;
  location: string;
  status: PurchaseOrder["status"];
  lines: OrderLineView[];
  createdAt: Date;
  /** The optimistic-lock version an edit must carry back (AUD-024, API-029). */
  version: number;
}

/** A line as entered: its quantity in any unit the material converts, its date and the requisition it converts, if any. */
export interface NewOrderLine {
  material: string;
  quantity: string;
  unit: string;
  plannedDate: string;
  requisition?: string | null;
  /** A location the client states for the line: only the order's own is accepted (BUY-007). */
  location?: string;
}

export interface NewOrder {
  supplier: string;
  location: string;
  lines: NewOrderLine[];
}

/** A line's new planned date, addressed by its number. */
export interface LineDateChange {
  line: number;
  plannedDate: string;
}

export const ORDER_ID_RACE = "Another purchase order was created at the same moment. Try again.";

/** A line ready to store. */
interface ResolvedLine {
  material: Material;
  record: BaseQuantity;
  plannedDate: string;
  requisition: PurchaseRequisition | null;
}

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's purchase orders (E09-S01): one supplier, one location and dated lines, created
 * directly or by converting requisitions. Resolved from a tenant scope, so every read and write is
 * that tenant's only (R05); any signed-in account writes. A new order can't name an inactive
 * supplier, location or material (BUY-025, LFC-019, MAT-029); a saved order stays usable when its
 * supplier is deactivated later (LFC-021). A line that names a requisition converts that much of it
 * in the same transaction, and the requisition completes when fully converted (BUY-003, BUY-004);
 * a requisition is never converted past its quantity. An order is planned supply only: it never
 * changes stock (BUY-009). Only a line's planned date changes afterwards (BUY-024). Every change
 * records its tenant audit entry in the same transaction (R08), and an edit carries the version
 * the caller loaded.
 */
export class PurchaseOrderService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** Every order of the tenant with its lines, by ID. */
  async list(): Promise<OrderView[]> {
    const orders = await this.em.find(PurchaseOrder, {}, { populate: ["supplier", "location"], orderBy: { code: "asc" } });
    return viewsOf(this.em, orders);
  }

  /** One order; `PURCHASE_ORDER_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<OrderView> {
    const [view] = await viewsOf(this.em, [await findOrder(this.em, id)]);
    return view;
  }

  /** A new Open order with the next ID, converting the requisitions its lines name (LFC-001, BUY-003). */
  async create(input: NewOrder, actor: AuditActor): Promise<OrderView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await insertOrder(em, input, actor);
        await em.flush();
        return (await viewsOf(em, [order]))[0];
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that. A requisition changed under the
      // conversion is the caller's stale view of it.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(ORDER_ID_RACE, "ORDER_ID_RACE");
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /**
   * New planned dates for some lines at `version` (BUY-024, spec Q8). A date equal to the stored one
   * is no change; with nothing changed, nothing is written or recorded. A line number the order
   * doesn't have is a field error on that entry. A Completed order refuses (goods-receipts spec Q8).
   */
  async setPlannedDates(id: string, changes: readonly LineDateChange[], version: number, actor: AuditActor): Promise<OrderView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findOrder(em, id, { refresh: true });
        if (order.version !== version) throw versionConflict();
        assertOrderOpen(order);
        const lines = await em.find(PurchaseOrderLine, { order }, { populate: ["material"] });
        const errors: FieldErrors = {};
        const before: Record<string, string> = {};
        const after: Record<string, string> = {};
        for (const [index, { line: number, plannedDate }] of changes.entries()) {
          const line = lines.find((each) => each.position === number);
          if (!line) {
            errors[`lines.${index}.line`] = [LINE_NO_SUCH_LINE_MESSAGE];
          } else if (line.plannedDate !== plannedDate) {
            if (line.status === "cancelled" || line.status === "closed-early") throw new ConflictError("This line is no longer open.", "DOCUMENT_NOT_OPEN");
            before[`line${number}PlannedDate`] = line.plannedDate;
            after[`line${number}PlannedDate`] = plannedDate;
            line.plannedDate = plannedDate;
          }
        }
        if (Object.keys(errors).length > 0) throw new ValidationError(errors);
        if (Object.keys(after).length > 0) {
          order.updatedAt = new Date();
          recordTenantAudit(em, actor, orderEntry("updated", order, before, after));
          await em.flush();
        }
        return (await viewsOf(em, [order]))[0];
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /** Cancel unreceived lines without undoing their recorded requisition conversions. */
  cancel(id: string, version: number, actor: AuditActor, lines?: readonly number[]): Promise<OrderView> {
    return this.resolve(id, version, actor, "cancel", lines);
  }

  /** Abandon the selected remaining supply while preserving receipts and converted requisitions. */
  closeEarly(id: string, version: number, actor: AuditActor, lines?: readonly number[]): Promise<OrderView> {
    return this.resolve(id, version, actor, "close-early", lines);
  }

  private async resolve(id: string, version: number, actor: AuditActor, action: LifecycleAction, selection?: readonly number[]): Promise<OrderView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findOrder(em, id, { refresh: true });
        if (order.version !== version) throw versionConflict();
        assertOrderOpen(order);
        const lines = await em.find(PurchaseOrderLine, { order }, { populate: ["material"], refresh: true });
        for (const line of lines) line.status = orderLineState(line);
        const before = lifecycleSnapshot(order, lines);
        const target = selectLifecycleLines(lines, selection, (line) => line.position);
        const resolved = resolveLifecycle(action, target.map((line) => ({ quantity: line.quantity, processed: line.received, abandoned: line.abandoned, status: line.status })));
        resolved.forEach(({ status, abandoned }, index) => { Object.assign(target[index], { status, abandoned }); });
        order.status = documentState(lines.map(({ status }) => status));
        order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
        recordTenantAudit(em, actor, orderEntry(action === "cancel" ? "cancelled" : "closed-early", order, before, lifecycleSnapshot(order, lines)));
        await em.flush();
        return (await viewsOf(em, [order]))[0];
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /**
   * Creates the demonstration orders (D06) when the tenant has none, and returns how many. Each is
   * built through the same rules as a save, in its own savepoint: one that breaks a rule here (a
   * demo supplier, location or material missing or inactive in an edited Test tenant, a requisition
   * already converted) is skipped. Their requisition is the demo requisition of that position. Not
   * audited, like the other demo records. Seeds nothing into a read-only tenant (R05).
   */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(PurchaseOrder, {})) > 0 || (await isScopeReadOnly(em))) return 0;
      let created = 0;
      for (const demo of DEMO_ORDERS) {
        const lines = demo.lines.map(({ requisition, ...line }) => ({
          ...line,
          requisition: requisition === undefined ? null : formatSequentialId(requisition),
        }));
        try {
          await em.transactional(async (savepoint) => {
            await insertOrder(savepoint, { ...demo, lines }, null);
            await savepoint.flush();
          });
          created += 1;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
        }
      }
      return created;
    });
  }
}

/**
 * Checks and inserts (unflushed) a new order with its lines, converts the requisitions they name,
 * and records the audit entries (none when `actor` is null: the demo seed). The supplier and the
 * location must be active; each line is resolved and its field errors collected into one
 * `VALIDATION_FAILED` keyed `lines.N.<field>`.
 */
async function insertOrder(em: EntityManager, input: NewOrder, actor: AuditActor | null): Promise<PurchaseOrder> {
  const supplier = await findActiveSupplier(em, input.supplier);
  const location = await findActiveLocation(em, input.location);
  const resolved = await resolveLines(em, input);
  const [highest] = await em.find(PurchaseOrder, {}, { orderBy: { code: "desc" }, limit: 1 });
  const code = nextSequentialId(highest?.code ?? null, {
    code: "ORDER_IDS_EXHAUSTED",
    message: "This tenant has used every eight-digit purchase order ID.",
  });
  const order = em.create(PurchaseOrder, { code, supplier, location, status: "open" });
  resolved.forEach(({ material, record, plannedDate, requisition }, index) => {
    const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
    em.create(PurchaseOrderLine, {
      order,
      position: index + 1,
      material,
      quantity: baseQuantity,
      enteredQuantity,
      enteredUnit,
      numerator,
      denominator,
      plannedDate,
      requisition,
    });
  });
  // Each requisition once, with everything this order takes from it.
  const taken = new Map<PurchaseRequisition, string>();
  for (const { record, requisition } of resolved) {
    if (requisition) taken.set(requisition, addQuantities(taken.get(requisition) ?? "0.000000", record.baseQuantity));
  }
  for (const [requisition, quantity] of taken) {
    const before = requisitionSnapshot(requisition);
    const progress = afterConversion(requisition.quantity, requisition.converted, quantity);
    Object.assign(requisition, { ...progress, status: documentState([progress.status]) });
    if (actor) recordTenantAudit(em, actor, requisitionEntry("converted", requisition, before, requisitionSnapshot(requisition)));
  }
  if (actor) {
    const snapshot = orderSnapshot(order, resolved);
    recordTenantAudit(em, actor, orderEntry("created", order, null, snapshot));
  }
  return order;
}

/**
 * Loads each line's material and requisition and converts its quantity. Field errors of all lines
 * are collected into one `VALIDATION_FAILED`: a line for another location than the order's (BUY-007),
 * a requisition of another material or location, a conversion the material refuses. An unknown
 * material or requisition is a 404, a requisition that is not Open, or that the order would convert
 * past its quantity, a 409.
 */
async function resolveLines(em: EntityManager, { location, lines }: NewOrder): Promise<ResolvedLine[]> {
  const errors: FieldErrors = {};
  const resolved: ResolvedLine[] = [];
  /** What the lines before this one already took from each requisition, six decimals. */
  const taken = new Map<string, string>();
  for (const [index, line] of lines.entries()) {
    const material = await findActiveMaterial(em, line.material);
    const field = (name: string) => `lines.${index}.${name}`;
    if (line.location !== undefined && line.location !== location) errors[field("location")] = [LINE_LOCATION_MESSAGE];
    let record: BaseQuantity | null = null;
    try {
      record = await convertToBaseQuantity(em, material, line);
    } catch (error) {
      const [name, message] = lineError(error);
      errors[field(name)] = [message];
    }
    let requisition: PurchaseRequisition | null = null;
    if (line.requisition) {
      requisition = await findRequisition(em, line.requisition);
      if (requisition.status !== "open") {
        throw new ConflictError(`Purchase requisition ${requisition.code} is not open, so it can't be converted.`, "REQUISITION_NOT_OPEN");
      }
      if (requisition.material.code !== line.material) {
        errors[field("requisition")] = [LINE_REQUISITION_MATERIAL_MESSAGE];
      } else if (requisition.location.code !== location) {
        errors[field("requisition")] = [LINE_REQUISITION_LOCATION_MESSAGE];
      } else if (record) {
        const earlier = addQuantities(requisition.converted, taken.get(requisition.code) ?? "0.000000");
        if (!fitsOutstanding(requisition.quantity, earlier, record.baseQuantity)) {
          throw new ConflictError(
            `Purchase requisition ${requisition.code} has only ${outstandingQuantity(requisition.quantity, earlier)} left to convert.`,
            "REQUISITION_OVER_CONVERTED",
          );
        }
        taken.set(requisition.code, addQuantities(taken.get(requisition.code) ?? "0.000000", record.baseQuantity));
      }
    }
    if (record) resolved.push({ material, record, plannedDate: line.plannedDate, requisition });
  }
  if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  return resolved;
}

/** The orders with their lines, in the order given, each line's material and requisition by business ID. */
async function viewsOf(em: EntityManager, orders: readonly PurchaseOrder[]): Promise<OrderView[]> {
  if (orders.length === 0) return [];
  const lines = await em.find(
    PurchaseOrderLine,
    { order: { $in: [...orders] } },
    { populate: ["material", "requisition"], orderBy: { position: "asc" } },
  );
  return orders.map((order) => ({
    id: order.code,
    supplier: order.supplier.code,
    location: order.location.code,
    status: order.status as OrderView["status"],
    lines: lines.filter((line) => line.order.id === order.id).map(toLineView),
    createdAt: order.createdAt,
    version: order.version,
  }));
}

function toLineView(line: PurchaseOrderLine): OrderLineView {
  const { position, material, quantity, enteredQuantity, enteredUnit, numerator, denominator, plannedDate, requisition, received, abandoned } = line;
  return {
    line: position,
    material: material.code,
    quantity,
    enteredQuantity,
    enteredUnit,
    numerator,
    denominator,
    plannedDate,
    requisition: requisition?.code ?? null,
    received,
    abandoned,
    outstanding: unresolvedQuantity(quantity, received, abandoned),
    status: orderLineState(line),
  };
}

/** An order as the audit may show it (R08): scalar fields, and the lines as one text value. */
function orderSnapshot(order: PurchaseOrder, lines: readonly ResolvedLine[]) {
  const text = lines
    .map(({ material, record, plannedDate, requisition }, index) => {
      const from = requisition ? ` from requisition ${requisition.code}` : "";
      return `${index + 1}: ${material.code} ${record.baseQuantity} ${material.baseUnit} on ${plannedDate}${from}`;
    })
    .join("; ");
  return { id: order.code, supplier: order.supplier.code, location: order.location.code, status: order.status, lines: text };
}

function orderEntry(action: string, order: PurchaseOrder, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  const { code, supplier } = order;
  return {
    action: `purchase-orders.purchase-order.${action}`,
    subject: { type: "PurchaseOrder", id: code, label: `${code} — ${supplier.code} ${supplier.name}` },
    before,
    after,
  };
}

/** Closure changes only these progress fields; original quantities, links and receipts stay intact. */
function lifecycleSnapshot(order: PurchaseOrder, lines: readonly PurchaseOrderLine[]) {
  return { status: order.status, lines: JSON.stringify(lines.map(({ position, quantity, received, abandoned, status }) =>
    ({ line: position, quantity, received, abandoned, status }))) };
}
