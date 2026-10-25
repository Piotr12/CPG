import { ProductionCompletion, ProductionOrder, OptimisticLockError, UniqueConstraintViolationException, type EntityManager, type FilterQuery, type OrderDefinition } from "@cpg/db";
import { documentState, resolveLines as resolveLifecycle, type LifecycleAction } from "../../domain/document-lifecycle/lifecycle";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { listOrderBy, searchWhere, type SortField } from "../../domain/lists/list-query";
import { productionStatus } from "../../domain/production-orders/production-completion";
import { plannedStart } from "../../domain/production-orders/production-planning";
import { parseDecimal } from "../../domain/quantities/decimal";
import { ConflictError, ValidationError, versionConflict } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { productionOrderCreateSchema, productionOrderOptionsSchema, productionOrderListSchema, productionOrderUpdateSchema, PRODUCTION_PAGE_SIZE,
  TARGET_BELOW_PRODUCED_MESSAGE, type ProductionOrderInput, type ProductionOptionsInput, type ProductionOrderChanges } from "../../validators/production-orders/production-order.schema";
import type { ListOptions } from "../../validators/lists/list-query.schema";
import type { ProductionOrderSort } from "../../validators/production-orders/production-order-list.schema";
import { recordTenantAudit } from "../audit/audit-recorder";
import type { AuditActor } from "../audit/actor";
import { convertToBaseQuantity } from "../materials/base-quantity";
import type { PostingContext } from "../stock/stock-posting";
import { findProductionOrder, PRODUCTION_POPULATE, productionOrderView, productionSnapshot, productionSubject } from "./production-order-records";
import { componentShortages, recipeComponents, resolveProductionOptions } from "./production-recipes";

export type { ProductionOrderView } from "./production-order-records";
export type { ProductionOptions, ProductionComponent, ProductionRecipe } from "./production-recipes";
export type ProductionOrderDetail = Awaited<ReturnType<ProductionOrderService["get"]>>;

/** What the Production orders search matches, and the column each sort key orders by (#217). */
const PRODUCTION_SEARCH_FIELDS = ["code", "output.code", "output.description"];
const PRODUCTION_SORT_PATHS: Record<ProductionOrderSort, SortField> = {
  id: "code", output: "output.code", quantity: { decimal: "quantity" }, location: "location.code", finish: "plannedFinish", start: "plannedStart", status: "status",
};

/** Manual planned production. All writes and their audit share the caller's tenant transaction; stock changes only through completions. */
export class ProductionOrderService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  /**
   * A page of orders by ID unless `sort` says otherwise (by ID within equal values); `q` keeps orders
   * whose ID or output ID or description holds every word (#217).
   */
  async list({ page = 1, q = "", sort = "id", dir = "asc" }: ListOptions<ProductionOrderSort> = {}) {
    const query = parseInput(productionOrderListSchema, { page });
    return (await this.em.find(ProductionOrder, searchWhere(q, PRODUCTION_SEARCH_FIELDS) as FilterQuery<ProductionOrder>, {
      populate: [...PRODUCTION_POPULATE], orderBy: listOrderBy(PRODUCTION_SORT_PATHS[sort], dir) as OrderDefinition<ProductionOrder>,
      limit: PRODUCTION_PAGE_SIZE, offset: (query.page - 1) * PRODUCTION_PAGE_SIZE })).map(productionOrderView);
  }
  /** How many orders `q` matches, for the pages of `list`. */
  async count({ q = "" }: Pick<ListOptions<ProductionOrderSort>, "q"> = {}) {
    return this.em.count(ProductionOrder, searchWhere(q, PRODUCTION_SEARCH_FIELDS) as FilterQuery<ProductionOrder>);
  }
  async get(id: string) { return detail(this.em, await findProductionOrder(this.em, id)); }
  async options(input: ProductionOptionsInput) {
    return (await resolveProductionOptions(this.em, parseInput(productionOrderOptionsSchema, input))).options;
  }
  create(input: ProductionOrderInput, actor: AuditActor) {
    return this.createWith(input, { kind: "user", actor }, (em, order) => detail(em, order));
  }

  /**
   * The demo seed's order, stamped at `at` and unaudited. The same checks apply, and the BOM revision's
   * validity is judged at the order's own planned finish, as for a user (the planned start, the finish
   * less the lead time, may precede the revision's start). It returns only the order's ID: the seed
   * reads nothing back (#163, #185).
   */
  seedDemo(input: ProductionOrderInput, at: Date): Promise<{ id: string }> {
    return this.createWith(input, { kind: "seed", at }, (_em, order) => ({ id: order.code }));
  }

  /** Inserts the order in one transaction and returns what `result` makes of it. */
  private async createWith<T>(input: ProductionOrderInput, context: PostingContext, result: (em: EntityManager, order: ProductionOrder) => T | Promise<T>): Promise<T> {
    const values = parseInput(productionOrderCreateSchema, input);
    try {
      return await this.em.transactional(async (em) => {
        const order = await insertOrder(em, values, context.kind === "seed" ? context.at : undefined);
        if (context.kind === "user") recordTenantAudit(em, context.actor, { action: "production-orders.production-order.created", subject: productionSubject(order), before: null, after: productionSnapshot(order) });
        await em.flush();
        return result(em, order);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError("Another production order was created at the same moment. Try again.", "PRODUCTION_ORDER_ID_RACE");
      throw error;
    }
  }
  async update(id: string, changes: ProductionOrderChanges, version: number, actor: AuditActor) {
    const input = parseInput(productionOrderUpdateSchema, { ...changes, version });
    try {
      return await this.em.transactional(async (em) => {
        const order = await findProductionOrder(em, id, { refresh: true });
        if (order.version !== version) throw versionConflict();
        if (order.status !== "open") throw new ConflictError("This production order is no longer Open.", "PRODUCTION_ORDER_LOCKED");
        const before = productionSnapshot(order);
        const quantity = input.quantity ?? order.enteredQuantity;
        const unit = input.unit ?? order.enteredUnit;
        if (parseDecimal(quantity) !== parseDecimal(order.enteredQuantity) || unit !== order.enteredUnit) {
          const record = await convertToBaseQuantity(em, order.output, { quantity, unit });
          if (parseDecimal(record.baseQuantity)! < parseDecimal(order.produced)!) throw new ValidationError({ quantity: [TARGET_BELOW_PRODUCED_MESSAGE] });
          order.quantity = record.baseQuantity;
          // A target lowered to exactly what was produced completes the order (spec Q8).
          order.status = productionStatus(order.produced, order.quantity);
          em.assign(order, { enteredQuantity: record.enteredQuantity, enteredUnit: record.enteredUnit, numerator: record.numerator, denominator: record.denominator });
        }
        if (input.plannedFinish !== undefined) {
          order.plannedFinish = input.plannedFinish;
          order.plannedStart = plannedStart(input.plannedFinish, order.leadTimeDays);
        }
        const after = productionSnapshot(order);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
          recordTenantAudit(em, actor, { action: "production-orders.production-order.updated", subject: productionSubject(order), before, after });
          await em.flush();
        }
        return detail(em, order);
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }
  cancel(id: string, version: number, actor: AuditActor) {
    return this.resolve(id, version, actor, "cancel");
  }

  closeEarly(id: string, version: number, actor: AuditActor) {
    return this.resolve(id, version, actor, "close-early");
  }

  private async resolve(id: string, version: number, actor: AuditActor, action: LifecycleAction) {
    try {
      return await this.em.transactional(async (em) => {
        const order = await findProductionOrder(em, id, { refresh: true });
        if (order.version !== version) throw versionConflict();
        const before = productionSnapshot(order);
        const hasProcessing = (await em.count(ProductionCompletion, { order })) > 0;
        const [resolved] = resolveLifecycle(action, [{ quantity: order.quantity, processed: order.produced,
          abandoned: order.abandoned, status: order.status }], { hasProcessing });
        order.abandoned = resolved.abandoned;
        order.status = documentState([resolved.status]);
        order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
        recordTenantAudit(em, actor, { action: `production-orders.production-order.${action === "cancel" ? "cancelled" : "closed-early"}`,
          subject: productionSubject(order), before, after: productionSnapshot(order) });
        await em.flush();
        return detail(em, order);
      });
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }
}
async function insertOrder(em: EntityManager, input: ProductionOrderInput, at?: Date) {
  const { output, location, record, records, options } = await resolveProductionOptions(em, input);
  const selection = input.bom === undefined ? options.selected : { bom: input.bom, revision: input.revision };
  const recipe = records.get(selection.bom);
  if (!recipe || recipe.number !== selection.revision) throw new ConflictError("The selected BOM revision changed or is no longer usable. Review the BOM choices again.", "PRODUCTION_BOM_CHANGED");
  const [highest] = await em.find(ProductionOrder, {}, { orderBy: { code: "desc" }, limit: 1 });
  const code = nextSequentialId(highest?.code ?? null, { code: "PRODUCTION_ORDER_IDS_EXHAUSTED", message: "This tenant has used every eight-digit production order ID." });
  const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
  return em.create(ProductionOrder, { code, output, location, recipe, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator,
    plannedFinish: input.plannedFinish, plannedStart: options.plannedStart, leadTimeDays: options.leadTimeDays,
    ...(at && { createdAt: at, updatedAt: at }) });
}
/** Requirements cover only what is still to be made: none once the order is resolved (LFC-004, PRD-029). */
async function detail(em: EntityManager, order: ProductionOrder) {
  const view = productionOrderView(order);
  const components = await recipeComponents(em, order.recipe, order.location, view.outstanding);
  return { ...view, hasProcessing: (await em.count(ProductionCompletion, { order })) > 0, components, shortages: componentShortages(components) };
}
