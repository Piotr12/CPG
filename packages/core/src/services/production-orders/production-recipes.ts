import { Bom, BomComponent, BomRevision, PlanningParameterSet, StockBalance, type EntityManager, type Location } from "@cpg/db";
import { componentRequirement, plannedStart } from "../../domain/production-orders/production-planning";
import { ConflictError } from "../../http/errors";
import { convertToBaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { findActiveLocation } from "../locations/find-location";
import type { ProductionOptionsInput } from "../../validators/production-orders/production-order.schema";

/** Bound SQLite OR expressions and lookup parameter sets without limiting selectable alternatives. */
const REFERENCE_BATCH_SIZE = 100;

export interface ProductionComponent {
  material: string; baseUnit: string; active: boolean; quantity: string;
  required: string; available: string; shortage: string;
}

/** Direct pinned requirements and current stock. History always reads the revision passed by the caller. */
export async function recipeComponents(em: EntityManager, recipe: BomRevision, location: Location, target: string): Promise<ProductionComponent[]> {
  return (await componentSets(em, [recipe], location, target)).get(recipe.id)!;
}

/** Batch alternatives together instead of repeating component and balance queries per recipe. */
async function componentSets(em: EntityManager, recipes: BomRevision[], location: Location, target: string) {
  const result = new Map<string, ProductionComponent[]>(recipes.map((recipe) => [recipe.id, []]));
  const lines = await em.find(BomComponent, { revision: { $in: recipes } }, { populate: ["material"], orderBy: { position: "asc" } });
  const materials = [...new Set(lines.map(({ material }) => material.id))];
  const available = new Map<string, string>();
  for (let offset = 0; offset < materials.length; offset += REFERENCE_BATCH_SIZE) {
    const balances = await em.find(StockBalance, { location, material: { $in: materials.slice(offset, offset + REFERENCE_BATCH_SIZE) } });
    for (const balance of balances) available.set(balance.material.id, balance.quantity);
  }
  for (const { revision, material, quantity } of lines) {
    result.get(revision.id)!.push({ material: material.code, baseUnit: material.baseUnit, active: material.active,
      quantity, ...componentRequirement(quantity, target, available.get(material.id) ?? "0.000000") });
  }
  return result;
}

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
  const alternatives: ProductionRecipe[] = [];
  const records = new Map<string, BomRevision>();
  // The unique (bom, number) index fetches only current revisions; old recipe history never hydrates.
  // Batches keep SQLite's expression/parameter counts bounded even with many alternatives.
  for (let offset = 0; offset < boms.length; offset += REFERENCE_BATCH_SIZE) {
    const recipes = await em.find(BomRevision, {
      $or: boms.slice(offset, offset + REFERENCE_BATCH_SIZE).map((bom) => ({ bom, number: bom.revision })),
      validFrom: { $lte: input.plannedFinish },
      $and: [{ $or: [{ validThrough: null }, { validThrough: { $gte: input.plannedFinish } }] }],
    }, { populate: ["bom"] });
    const componentsByRevision = await componentSets(em, recipes, location, record.baseQuantity);
    for (const recipe of recipes) {
      const components = componentsByRevision.get(recipe.id)!;
      if (components.some(({ active }) => !active)) continue;
      alternatives.push({ bom: recipe.bom.code, revision: recipe.number, priority: recipe.priority,
        validFrom: recipe.validFrom, validThrough: recipe.validThrough ?? null, components });
      records.set(recipe.bom.code, recipe);
    }
  }
  alternatives.sort((first, second) => first.priority - second.priority);
  if (alternatives.length === 0) throw new ConflictError("There is no active, date-valid BOM with active components for this output.", "PRODUCTION_NO_USABLE_BOM");
  const selected = alternatives.find(({ components }) => componentShortages(components).length === 0) ?? alternatives[0];
  const options: ProductionOptions = { quantity: record.baseQuantity, plannedStart: plannedStart(input.plannedFinish, parameters.leadTimeDays),
    leadTimeDays: parameters.leadTimeDays, alternatives, selected: { bom: selected.bom, revision: selected.revision } };
  return { output, location, record, records, options };
}
