import { randomUUID } from "node:crypto";
import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { Material, MATERIAL_UNIT_MAX } from "../materials/material.entity";
import { tenantOwned } from "../tenants/tenant-owned";
import { ProductionOrder } from "./production-order.entity";

/** What the triggers say when anything tries to change a posted completion or one of its lines. */
export const PRODUCTION_COMPLETION_IMMUTABLE = "Production completions are immutable";

/**
 * Triggers that make a completion table's rows unchangeable in the database itself: a completion is
 * history, and its reversal (E11-S03) will append, never rewrite. The Test reset can still delete rows.
 */
function completionTriggers(table: string) {
  const body = `select raise(abort, '${PRODUCTION_COMPLETION_IMMUTABLE}');`;
  return [{ name: `${table}_no_update`, timing: "before" as const, events: ["update" as const], body }];
}

const owned = tenantOwned();

/**
 * What production made and used for one `order` (E10-S02), posted on `businessDate` (the server's UTC
 * date, PRD-023) at `createdAt`. `code` is its business ID: eight digits, sequential per tenant. `quantity`
 * is the output in the output's base unit, `0.000000` for a waste posting (PRD-018), with the entered
 * quantity, unit and factor kept. Its stock movements carry its `id` as their posting ID. `submission`
 * is the UI dialog's duplicate-submit token: a repeat of it returns this completion instead of posting again.
 */
export const ProductionCompletion = defineEntity({
  name: "ProductionCompletion",
  filters: owned.filters,
  properties: {
    // Always given: the posting generates it first, because its stock movements carry it.
    id: p.uuid().primary(),
    tenant: owned.tenant,
    code: p.string().length(8),
    order: () => p.manyToOne(ProductionOrder),
    businessDate: p.string().length(10),
    quantity: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    submission: p.uuid().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
  uniques: [{ properties: ["tenant", "code"] }, { properties: ["tenant", "submission"] }],
  indexes: [{ properties: ["tenant", "order", "code"] }],
  triggers: completionTriggers("production_completion"),
});

export type ProductionCompletion = InferEntity<typeof ProductionCompletion>;

/**
 * One material a completion consumed, or was expected to: `expected` is the pinned recipe's quantity for
 * the completion's output (zero for an `extra` input and for waste), `actual` what was used, `variance`
 * their signed difference (actual − expected, PRD-013/014). All are six-decimal base-unit text (R03); the
 * actual's entered quantity, unit and factor are kept. `position` orders pinned components first.
 */
export const ProductionCompletionLine = defineEntity({
  name: "ProductionCompletionLine",
  filters: owned.filters,
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    tenant: owned.tenant,
    completion: () => p.manyToOne(ProductionCompletion),
    position: p.integer(),
    material: () => p.manyToOne(Material).index(),
    expected: p.string(),
    actual: p.string(),
    variance: p.string(),
    enteredQuantity: p.string(),
    enteredUnit: p.string().length(MATERIAL_UNIT_MAX),
    numerator: p.string(),
    denominator: p.string(),
    extra: p.boolean(),
  },
  uniques: [{ properties: ["completion", "position"] }, { properties: ["completion", "material"] }],
  triggers: completionTriggers("production_completion_line"),
});

export type ProductionCompletionLine = InferEntity<typeof ProductionCompletionLine>;
