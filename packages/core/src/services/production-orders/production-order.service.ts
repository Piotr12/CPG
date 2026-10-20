import { ProductionOrder, OptimisticLockError, UniqueConstraintViolationException, type EntityManager } from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { DEMO_PRODUCTION_ORDER } from "../../domain/production-orders/demo-production-orders";
import { plannedStart } from "../../domain/production-orders/production-planning";
import { parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError, ValidationError, versionConflict } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { productionOrderCreateSchema, productionOrderOptionsSchema, productionOrderListSchema, productionOrderUpdateSchema, PRODUCTION_PAGE_SIZE,
  type ProductionOrderInput, type ProductionOptionsInput, type ProductionOrderChanges } from "../../validators/production-orders/production-order.schema";
import { recordTenantAudit } from "../audit/audit-recorder";
import type { AuditActor } from "../audit/actor";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { isScopeReadOnly } from "../tenants/tenant.service";
import { findProductionOrder, PRODUCTION_POPULATE, productionOrderView, productionSnapshot, productionSubject } from "./production-order-records";
import { componentShortages, recipeComponents, resolveProductionOptions } from "./production-recipes";

export type { ProductionOrderView } from "./production-order-records";
export type { ProductionOptions, ProductionComponent, ProductionRecipe } from "./production-recipes";
export type ProductionOrderDetail = Awaited<ReturnType<ProductionOrderService["get"]>>;

/** Manual planned production. All writes and their audit share the caller's tenant transaction; stock never changes. */
export class ProductionOrderService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) { this.em = em; }

  async list(page = 1) {
    const query = parseInput(productionOrderListSchema, { page });
    return (await this.em.find(ProductionOrder, {}, { populate: [...PRODUCTION_POPULATE], orderBy: { code: "asc" },
      limit: PRODUCTION_PAGE_SIZE, offset: (query.page - 1) * PRODUCTION_PAGE_SIZE })).map(productionOrderView);
  }
  async count() { return this.em.count(ProductionOrder, {}); }
  async get(id: string) { return detail(this.em, await findProductionOrder(this.em, id)); }
  async options(input: ProductionOptionsInput) {
    return (await resolveProductionOptions(this.em, parseInput(productionOrderOptionsSchema, input))).options;
  }
  async create(input: ProductionOrderInput, actor: AuditActor) {
    const values = parseInput(productionOrderCreateSchema, input);
    try {
      return await this.em.transactional(async (em) => {
        const order = await insertOrder(em, values);
        recordTenantAudit(em, actor, { action: "production-orders.production-order.created", subject: productionSubject(order), before: null, after: productionSnapshot(order) });
        await em.flush();
        return detail(em, order);
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
        const order = await findProductionOrder(em, id, true);
        if (order.version !== version) throw versionConflict();
        if (order.status !== "open") throw new ConflictError("This production order is no longer Open.", "PRODUCTION_ORDER_LOCKED");
        const before = productionSnapshot(order);
        const quantity = input.quantity ?? order.enteredQuantity;
        const unit = input.unit ?? order.enteredUnit;
        if (parseDecimal(quantity) !== parseDecimal(order.enteredQuantity) || unit !== order.enteredUnit) {
          const record = await convertToBaseQuantity(em, order.output, { quantity, unit });
          if (parseDecimal(record.baseQuantity)! < parseDecimal(order.produced)!) throw new ValidationError({ quantity: ["The target cannot be less than the quantity already produced."] });
          order.quantity = record.baseQuantity;
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
  /** Startup tolerates an edited Test dataset; reset verifies the shared registry's expected count. */
  async seedDemo(): Promise<number> {
    return this.em.transactional(async (em) => {
      if ((await em.count(ProductionOrder, {})) > 0 || await isScopeReadOnly(em)) return 0;
      try {
        await em.transactional(async (savepoint) => { await insertOrder(savepoint, DEMO_PRODUCTION_ORDER); await savepoint.flush(); });
        return 1;
      } catch (error) {
        if (error instanceof AppError) return 0;
        throw error;
      }
    });
  }
}
async function insertOrder(em: EntityManager, input: ProductionOrderInput) {
  const { output, location, record, records, options } = await resolveProductionOptions(em, input);
  const selection = input.bom === undefined ? options.selected : { bom: input.bom, revision: input.revision };
  const recipe = records.get(selection.bom);
  if (!recipe || recipe.number !== selection.revision) throw new ConflictError("The selected BOM revision changed or is no longer usable. Review the recipe choices again.", "PRODUCTION_BOM_CHANGED");
  const [highest] = await em.find(ProductionOrder, {}, { orderBy: { code: "desc" }, limit: 1 });
  const code = nextSequentialId(highest?.code ?? null, { code: "PRODUCTION_ORDER_IDS_EXHAUSTED", message: "This tenant has used every eight-digit production order ID." });
  const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
  return em.create(ProductionOrder, { code, output, location, recipe, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator,
    plannedFinish: input.plannedFinish, plannedStart: options.plannedStart, leadTimeDays: options.leadTimeDays });
}
async function detail(em: EntityManager, order: ProductionOrder) {
  const components = await recipeComponents(em, order.recipe, order.location, order.quantity);
  return { ...productionOrderView(order), components, shortages: componentShortages(components) };
}
