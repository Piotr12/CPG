import {
  Customer, CustomerOrder, CustomerOrderLine, OptimisticLockError, UniqueConstraintViolationException,
  type EntityManager, type FilterQuery, type Material, type DocumentState, type OrderDefinition,
} from "@cpg/db";
import { documentState, resolveLines as resolveLifecycle, type LifecycleAction } from "../../domain/document-lifecycle/lifecycle";
import { selectLifecycleLines } from "../../domain/document-lifecycle/select-lines";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { listOrderBy, searchWhere } from "../../domain/lists/list-query";
import { isLineFulfilled } from "../../domain/goods-issues/issue-quantity";
import { parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError, ValidationError, versionConflict } from "../../http/errors";
import {
  customerOrderCreateSchema, customerOrderUpdateSchema, customerOrderListSchema, ORDER_PAGE_SIZE, ORDER_LINE_ID_MESSAGE, ORDER_QUANTITY_MIN_MESSAGE, ORDER_UNIT_CONVERSION_MESSAGE, ORDER_QUANTITY_CONVERSION_MESSAGE,
  type CustomerOrderInput, type CustomerOrderChanges,
} from "../../validators/customer-orders/customer-order.schema";
import type { CustomerOrderSort } from "../../validators/customer-orders/customer-order-list.schema";
import type { ListOptions } from "../../validators/lists/list-query.schema";
import { validationError } from "../../http/parse-input";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial, findMaterial } from "../materials/find-material";
import { findNamedRecord } from "../named-records/find-named-record";
import { completeFinishedShipments, isAnyShipped } from "../shipments/shipment-usage";
import { findCustomerOrder } from "./order-records";
import { postedOrderLineIds } from "./posted-order-lines";

export interface CustomerOrderLineView {
  id: string;
  material: string;
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
  requiredDate: string;
  fulfilled: string;
  /** A physical issue has ever referenced this line, even when all issues have been reversed. */
  posted: boolean;
  abandoned: string;
  status: DocumentState;
}
export interface CustomerOrderView {
  id: string;
  customer: string;
  location: string;
  status: DocumentState;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  lines: CustomerOrderLineView[];
}
interface ResolvedLine { existing?: CustomerOrderLine; material: Material; record: BaseQuantity; requiredDate: string }
const CUSTOMER_LOOKUP = { entity: Customer, noun: "customer", codePrefix: "CUSTOMER" };
const POPULATE = ["customer", "location"] as const;
/** What the Customer orders search matches, and the column each sort key orders by (#217). */
const ORDER_SEARCH_FIELDS = ["code", "customer.code", "customer.name"];
const ORDER_SORT_PATHS: Record<CustomerOrderSort, string> = { id: "code", customer: "customer.code", location: "location.code", status: "status" };
const locked = () => new ConflictError("This order or a posted line can't be changed that way.", "CUSTOMER_ORDER_LOCKED");

/** Tenant-local, audited customer demand. Writes persist the full aggregate under its header version. */
export class CustomerOrderService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  /**
   * Fixed-size pages bound both the query and its full line payload, by ID unless `sort` says
   * otherwise (by ID within equal values); `q` keeps orders whose ID or customer ID or name holds
   * every word (#217).
   */
  async list({ page = 1, q = "", sort = "id", dir = "asc" }: ListOptions<CustomerOrderSort> = {}): Promise<CustomerOrderView[]> {
    const parsed = customerOrderListSchema.safeParse({ page });
    if (!parsed.success) throw validationError(parsed.error);
    const em = this.em;
    const orders = await em.find(CustomerOrder, searchWhere(q, ORDER_SEARCH_FIELDS) as FilterQuery<CustomerOrder>, {
      populate: [...POPULATE], orderBy: listOrderBy(ORDER_SORT_PATHS[sort], dir) as OrderDefinition<CustomerOrder>,
      limit: ORDER_PAGE_SIZE, offset: (parsed.data.page - 1) * ORDER_PAGE_SIZE,
    });
    if (orders.length === 0) return [];
    const lines = await em.find(CustomerOrderLine, { order: { $in: orders }, removed: false }, { populate: ["material"], orderBy: { position: "asc" } });
    const grouped = new Map<string, CustomerOrderLine[]>();
    for (const line of lines) {
      const group = grouped.get(line.order.id) ?? [];
      group.push(line); grouped.set(line.order.id, group);
    }
    const posted = await postedOrderLineIds(em, lines);
    return orders.map((order) => view(order, grouped.get(order.id)!, posted));
  }

  /** How many orders `q` matches, for the pages of `list`. */
  async count({ q = "" }: Pick<ListOptions<CustomerOrderSort>, "q"> = {}): Promise<number> {
    return this.em.count(CustomerOrder, searchWhere(q, ORDER_SEARCH_FIELDS) as FilterQuery<CustomerOrder>);
  }

  async get(id: string): Promise<CustomerOrderView> {
    return detail(this.em, await findCustomerOrder(this.em, id));
  }

  create(input: CustomerOrderInput, actor: AuditActor): Promise<CustomerOrderView> {
    return this.createWith(input, undefined, async (em, order) => {
      const result = await detail(em, order);
      recordTenantAudit(em, actor, { action: "customer-orders.customer-order.created", subject: subject(order), before: null, after: snapshot(result) });
      await em.flush();
      return result;
    });
  }

  /**
   * The demo seed's order, stamped at `at` and unaudited; every business rule of `create` still
   * applies. It returns only the order's ID and its line IDs, in line order: the seed's shipments
   * need nothing else, and reading the order back costs about as much as creating it (#163, #185).
   */
  seedDemo(input: CustomerOrderInput, at: Date): Promise<{ id: string; lines: string[] }> {
    return this.createWith(input, at, (_em, order, lines) => ({ id: order.code, lines: lines.map(({ id }) => id) }));
  }

  /** Inserts the order, stamped at `at` when the seed writes it, in one transaction, and returns what `result` makes of it. */
  private async createWith<T>(
    input: CustomerOrderInput, at: Date | undefined,
    result: (em: EntityManager, order: CustomerOrder, lines: readonly CustomerOrderLine[]) => T | Promise<T>,
  ): Promise<T> {
    const parsed = customerOrderCreateSchema.safeParse(input);
    if (!parsed.success) throw validationError(parsed.error);
    try {
      return await this.em.transactional(async (em) => {
        const { order, lines } = await insertOrder(em, parsed.data, at);
        return result(em, order, lines);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        throw new ConflictError("Another order was created at the same moment. Try again.", "CUSTOMER_ORDER_ID_RACE");
      }
      throw error;
    }
  }

  async update(id: string, input: CustomerOrderChanges, version: number, actor: AuditActor): Promise<CustomerOrderView> {
    const parsed = customerOrderUpdateSchema.safeParse({ ...input, version });
    if (!parsed.success) throw validationError(parsed.error);
    try {
      return await this.em.transactional(async (em) => {
        const order = await findCustomerOrder(em, id, { refresh: true });
        if (order.version !== version) throw versionConflict();
        if (order.status !== "open") throw locked();
        const current = await orderLines(em, order);
        const posted = await postedOrderLineIds(em, current);
        const before = view(order, current, posted);
        const changes = parsed.data;
        if (current.some((line) => wasPosted(line, posted)) &&
          (changes.customer !== order.customer.code || changes.location !== order.location.code)) throw locked();
        const customer = changes.customer === order.customer.code ? order.customer : await activeCustomer(em, changes.customer);
        const location = changes.location === order.location.code ? order.location : await findActiveLocation(em, changes.location);
        const resolved = await resolveLines(em, changes.lines, current, posted);
        if (current.some((line) => !resolved.some(({ existing }) => existing?.id === line.id) &&
          (line.status !== "open" || wasPosted(line, posted) || parseDecimal(line.abandoned)! > 0n))) throw locked();
        // A line a shipment names keeps its material and stays on the order (shipments spec Q10).
        const removedOrReplaced = current.filter((line) => resolved.find(({ existing }) => existing?.id === line.id)?.material.id !== line.material.id);
        if (await isAnyShipped(em, removedOrReplaced)) throw locked();
        order.customer = customer;
        order.location = location;
        const kept = new Set(resolved.map(({ existing }) => existing?.id));
        current.filter((line) => !kept.has(line.id)).forEach((line) => { line.removed = true; });
        const saved = resolved.map(({ existing, material, record, requiredDate }, position) => {
          const fields = { material, position, quantity: record.baseQuantity, enteredQuantity: record.enteredQuantity, enteredUnit: record.enteredUnit,
            numerator: record.numerator, denominator: record.denominator, requiredDate };
          if (existing && existing.material.id !== material.id) archiveLine(em, existing);
          return existing ? em.assign(existing, fields) : em.create(CustomerOrderLine, { order, ...fields });
        });
        completeDelivered(order, saved);
        await completeFinishedShipments(em, order, { kind: "user", actor });
        // New UUIDs are assigned on create; comparing allowlisted snapshots also detects reordering.
        if (JSON.stringify(snapshot(before)) !== JSON.stringify(snapshot(view(order, saved, posted)))) {
          order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
          recordTenantAudit(em, actor, { action: "customer-orders.customer-order.updated", subject: subject(order), before: snapshot(before), after: snapshot(view(order, saved, posted)) });
        }
        await em.flush();
        return view(order, saved, posted);
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }

  /** Cancel unprocessed demand, retaining every historical line and shipment reference. */
  cancel(id: string, version: number, actor: AuditActor, lines?: readonly string[]): Promise<CustomerOrderView> {
    return this.resolve(id, version, actor, "cancel", lines);
  }

  /** Abandon an unfinished remainder, preserving deliveries and completing finished shipment contexts. */
  closeEarly(id: string, version: number, actor: AuditActor, lines?: readonly string[]): Promise<CustomerOrderView> {
    return this.resolve(id, version, actor, "close-early", lines);
  }

  private async resolve(id: string, version: number, actor: AuditActor, action: LifecycleAction, selection?: readonly string[]): Promise<CustomerOrderView> {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findCustomerOrder(em, id, { refresh: true });
        if (order.version !== version) throw versionConflict();
        if (order.status !== "open") throw locked();
        const lines = await em.find(CustomerOrderLine, { order, removed: false }, { populate: ["material"], orderBy: { position: "asc" }, refresh: true });
        const posted = await postedOrderLineIds(em, lines);
        const before = snapshot(view(order, lines, posted));
        const target = selectLifecycleLines(lines, selection, (line) => line.id);
        const resolved = resolveLifecycle(action, target.map((line) => ({ quantity: line.quantity, processed: line.fulfilled, abandoned: line.abandoned, status: line.status })),
          { hasProcessing: target.some((line) => wasPosted(line, posted)) });
        resolved.forEach(({ status, abandoned }, index) => { Object.assign(target[index], { status, abandoned }); });
        order.status = documentState(lines.map(({ status }) => status));
        order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
        await completeFinishedShipments(em, order, { kind: "user", actor });
        recordTenantAudit(em, actor, { action: `customer-orders.customer-order.${action === "cancel" ? "cancelled" : "closed-early"}`,
          subject: subject(order), before, after: snapshot(view(order, lines, posted)) });
        await em.flush();
        return view(order, lines, posted);
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }
}

async function activeCustomer(em: EntityManager, code: string): Promise<Customer> {
  const customer = await findNamedRecord(em, CUSTOMER_LOOKUP, code);
  if (!customer.active) throw new ConflictError(`Customer ${code} is inactive, so it can't be picked for new orders.`, "CUSTOMER_INACTIVE");
  return customer as Customer;
}
async function insertOrder(em: EntityManager, input: CustomerOrderInput, at?: Date): Promise<{ order: CustomerOrder; lines: CustomerOrderLine[] }> {
  const customer = await activeCustomer(em, input.customer);
  const location = await findActiveLocation(em, input.location);
  const resolved = await resolveLines(em, input.lines, [], new Set());
  const [highest] = await em.find(CustomerOrder, {}, { orderBy: { code: "desc" }, limit: 1 });
  const code = nextSequentialId(highest?.code ?? null, { code: "CUSTOMER_ORDER_IDS_EXHAUSTED", message: "This tenant has used every eight-digit customer order ID." });
  const order = em.create(CustomerOrder, { code, customer, location, ...(at && { createdAt: at, updatedAt: at }) });
  const lines = resolved.map(({ material, record, requiredDate }, position) => em.create(CustomerOrderLine, {
    order, material, position, quantity: record.baseQuantity, enteredQuantity: record.enteredQuantity, enteredUnit: record.enteredUnit,
    numerator: record.numerator, denominator: record.denominator, requiredDate,
  }));
  await em.flush();
  return { order, lines };
}
async function resolveLines(em: EntityManager, inputs: (CustomerOrderInput["lines"][number] & { id?: string })[], current: CustomerOrderLine[], posted: ReadonlySet<string>): Promise<ResolvedLine[]> {
  const resolved: ResolvedLine[] = [];
  const seen = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    const existing = input.id === undefined ? undefined : current.find((line) => line.id === input.id);
    if (input.id !== undefined && (!existing || seen.has(input.id))) throw new ValidationError({ [`lines.${index}.id`]: [ORDER_LINE_ID_MESSAGE] });
    if (input.id !== undefined) seen.add(input.id);
    const sameMaterial = existing?.material.code === input.material;
    const material = sameMaterial ? await findMaterial(em, input.material) : await findActiveMaterial(em, input.material);
    const unchangedEntry = sameMaterial && existing!.enteredUnit === input.unit && parseDecimal(existing!.enteredQuantity) === parseDecimal(input.quantity);
    let record: BaseQuantity;
    if (unchangedEntry) record = { baseQuantity: existing!.quantity, enteredQuantity: existing!.enteredQuantity, enteredUnit: existing!.enteredUnit, numerator: existing!.numerator, denominator: existing!.denominator };
    else {
      try { record = await convertToBaseQuantity(em, material, input); }
      catch (error) {
        if (!(error instanceof AppError)) throw error;
        const field = error.code === "UNIT_NOT_CONVERTIBLE" ? "unit" : "quantity";
        throw new ValidationError({ [`lines.${index}.${field}`]: [field === "unit" ? ORDER_UNIT_CONVERSION_MESSAGE : ORDER_QUANTITY_CONVERSION_MESSAGE] });
      }
    }
    if (existing) {
      const same = unchangedEntry && existing.requiredDate === input.requiredDate;
      if (existing.status !== "open" && !same) throw locked();
      if (wasPosted(existing, posted) && (!sameMaterial || existing.enteredUnit !== input.unit || existing.requiredDate !== input.requiredDate)) throw locked();
      if (parseDecimal(record.baseQuantity)! < parseDecimal(existing.fulfilled)! + parseDecimal(existing.abandoned)!) {
        throw new ValidationError({ [`lines.${index}.quantity`]: [ORDER_QUANTITY_MIN_MESSAGE] });
      }
    }
    resolved.push({ existing, material, record, requiredDate: input.requiredDate });
  }
  return resolved;
}
/**
 * A delivered line whose quantity was lowered to exactly its fulfilled quantity is complete, and so is
 * the order once every line is (shipments spec Q8): nothing is left to issue, so it can't stay Open.
 */
function completeDelivered(order: CustomerOrder, lines: readonly CustomerOrderLine[]): void {
  for (const line of lines) if (line.status === "open" && parseDecimal(line.fulfilled)! > 0n && isLineFulfilled(line)) line.status = "completed";
  order.status = documentState(lines.map(({ status }) => status));
}
async function orderLines(em: EntityManager, order: CustomerOrder) {
  return em.find(CustomerOrderLine, { order, removed: false }, { populate: ["material"], orderBy: { position: "asc" } });
}
async function detail(em: EntityManager, order: CustomerOrder): Promise<CustomerOrderView> {
  const lines = await orderLines(em, order);
  return view(order, lines, await postedOrderLineIds(em, lines));
}
function wasPosted(line: CustomerOrderLine, posted: ReadonlySet<string>): boolean { return posted.has(line.id) || parseDecimal(line.fulfilled)! > 0n; }
function view(order: CustomerOrder, lines: CustomerOrderLine[], posted: ReadonlySet<string>): CustomerOrderView {
  return {
    id: order.code, customer: order.customer.code, location: order.location.code, status: order.status, version: order.version,
    createdAt: order.createdAt, updatedAt: order.updatedAt,
    lines: lines.map((line) => {
      const { id, material, quantity, enteredQuantity, enteredUnit, numerator, denominator, requiredDate, fulfilled, abandoned, status } = line;
      return { id, material: material.code, quantity, enteredQuantity, enteredUnit, numerator, denominator, requiredDate, fulfilled, abandoned, status, posted: wasPosted(line, posted) };
    }),
  };
}
function subject(order: CustomerOrder) { return { type: "CustomerOrder", id: order.code, label: `Customer order ${order.code}` }; }
function snapshot({ id, customer, location, status, lines }: CustomerOrderView) { return { id, customer, location, status, lines: JSON.stringify(lines) }; }

/** A replacement must retain the old operational reference even though the visible line keeps its ID. */
function archiveLine(em: EntityManager, line: CustomerOrderLine): void {
  const { order, position, material, quantity, enteredQuantity, enteredUnit, numerator, denominator, requiredDate, fulfilled, abandoned, status } = line;
  em.create(CustomerOrderLine, { order, position, material, quantity, enteredQuantity, enteredUnit, numerator, denominator,
    requiredDate, fulfilled, abandoned, status, removed: true });
}
