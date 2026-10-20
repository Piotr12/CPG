import { Bom, BomComponent, BomRevision, PlanningParameterSet, StockBalance, type EntityManager, type Location } from "@cpg/db";
import { componentRequirement, plannedStart } from "../../domain/production-orders/production-planning";
import { ConflictError } from "../../http/errors";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { findActiveLocation } from "../locations/find-location";
import type { ProductionOptionsInput } from "../../validators/production-orders/production-order.schema";

/** Direct pinned requirements and current stock. History always reads the revision passed by the caller. */
export async function recipeComponents(em: EntityManager, recipe: BomRevision, location: Location, target: string) {
  const lines = await em.find(BomComponent, { revision: recipe }, { populate: ["material"], orderBy: { position: "asc" } });
  const balances = await em.find(StockBalance, { location, material: { $in: lines.map(({ material }) => material) } });
  const available = new Map(balances.map((balance) => [balance.material.id, balance.quantity]));
  return lines.map(({ material, quantity }) => ({ material: material.code, baseUnit: material.baseUnit,
    active: material.active, quantity, ...componentRequirement(quantity, target, available.get(material.id) ?? "0.000000") }));
}
export type ProductionComponent = Awaited<ReturnType<typeof recipeComponents>>[number];
export interface ProductionRecipe {
  bom: string; revision: number; priority: number; validFrom: string; validThrough: string | null;
  components: ProductionComponent[];
}
export interface ProductionOptions {
  quantity: string; plannedStart: string; leadTimeDays: number;
  alternatives: ProductionRecipe[]; selected: { bom: string; revision: number };
}
export function componentShortages(components: ProductionComponent[]) {
  return components.filter(({ shortage }) => shortage !== "0.000000");
}

/** New selection uses active masters and current date-valid revisions; manual shortages stay advisory. */
export async function resolveProductionOptions(em: EntityManager, input: ProductionOptionsInput) {
  const output = await findActiveMaterial(em, input.output);
  const location = await findActiveLocation(em, input.location);
  const parameters = await em.findOne(PlanningParameterSet, { material: output, location });
  if (output.type === "raw" || !parameters || parameters.procurement !== "make") {
    throw new ConflictError("Choose a Make material with planning parameters at this location.", "PRODUCTION_REQUIRES_MAKE");
  }
  const record = await convertToBaseQuantity(em, output, input);
  const boms = await em.find(Bom, { output, active: true });
  const recipes = await em.find(BomRevision, { bom: { $in: boms }, validFrom: { $lte: input.plannedFinish },
    $or: [{ validThrough: null }, { validThrough: { $gte: input.plannedFinish } }] }, { populate: ["bom"], orderBy: { priority: "asc" } });
  const alternatives: ProductionRecipe[] = [];
  const records = new Map<string, BomRevision>();
  for (const recipe of recipes) {
    if (recipe.number !== recipe.bom.revision) continue;
    const components = await recipeComponents(em, recipe, location, record.baseQuantity);
    if (components.some(({ active }) => !active)) continue;
    alternatives.push({ bom: recipe.bom.code, revision: recipe.number, priority: recipe.priority,
      validFrom: recipe.validFrom, validThrough: recipe.validThrough ?? null, components });
    records.set(recipe.bom.code, recipe);
  }
  if (alternatives.length === 0) throw new ConflictError("There is no active, date-valid BOM with active components for this output.", "PRODUCTION_NO_USABLE_BOM");
  const selected = alternatives.find(({ components }) => componentShortages(components).length === 0) ?? alternatives[0];
  const options: ProductionOptions = { quantity: record.baseQuantity, plannedStart: plannedStart(input.plannedFinish, parameters.leadTimeDays),
    leadTimeDays: parameters.leadTimeDays, alternatives, selected: { bom: selected.bom, revision: selected.revision } };
  return { output, location, record, records, options };
}
