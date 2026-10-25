import { documentState } from "../../domain/document-lifecycle/lifecycle";
import { randomUUID } from "node:crypto";
import {
  BomComponent,
  Material,
  MaterialConversion,
  OptimisticLockError,
  ProductionCompletion,
  ProductionCompletionLine,
  StockBalance,
  StockMovement,
  UniqueConstraintViolationException,
  type EntityManager,
  type ProductionOrder,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import {
  consumptionVariance,
  exceedsTarget,
  expectedConsumption,
  producedAfter,
  productionStatus,
} from "../../domain/production-orders/production-completion";
import { parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ConflictError, NotFoundError, ValidationError, type FieldErrors } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { FINISHED_COMPONENT_MESSAGE } from "../../validators/boms/bom-fields.schema";
import { STATISTICAL_UNIT } from "../../validators/units/unit-registry";
import {
  COMPLETION_MOVEMENTS_MAX,
  COMPLETION_MOVEMENTS_MESSAGE,
  COMPLETION_PAGE_SIZE,
  EXTRA_INPUT_QUANTITY_MESSAGE,
  INACTIVE_INPUT_MESSAGE,
  MISSING_COMPONENT_MESSAGE,
  OUTPUT_AS_INPUT_MESSAGE,
  SUBMISSION_REUSED_MESSAGE,
  productionCompletionCreateSchema,
  productionCompletionListSchema,
  productionCompletionPreviewSchema,
  UNKNOWN_INPUT_MESSAGE,
  type ProductionCompletionInput,
  type ProductionCompletionPreviewInput,
} from "../../validators/production-orders/production-completion.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { lineError } from "../materials/line-error";
import { postHistoricalInverses, postStockMovements, type PostingContext, type StockMovementView } from "../stock/stock-posting";
import { existingReversal, linkReversals, subtractReversedQuantity } from "../stock/reversal-records";
import { isScopeReadOnly } from "../tenants/tenant.service";
import { businessIdSchema } from "../../validators/business-ids/business-id.schema";
import { stockReversalSchema } from "../../validators/stock/stock-reversal.schema";
import {
  assertCompletionHistory,
  completionAlreadyReversed,
  completionReversals,
  PRODUCTION_COMPLETION_MOVEMENT,
  type CompletionReversalView,
} from "./completion-reversal";
import { findProductionOrder, productionOrderView, productionSubject, type ProductionOrderView } from "./production-order-records";

/** The stock movement type a completion posts (INV-012: every movement names its source). */
export { PRODUCTION_COMPLETION_MOVEMENT };
export type { CompletionReversalView };
export const COMPLETION_ID_RACE = "Another production completion was posted at the same moment. Try again.";

/** One material of a completion as the screens and the API show it: expected, actual and variance in its base unit. */
export interface CompletionLineView {
  material: string;
  baseUnit: string;
  expected: string;
  actual: string;
  variance: string;
  enteredQuantity: string;
  enteredUnit: string;
  /** Not in the order's pinned recipe: an added input (PRD-015, PRD-016). */
  extra: boolean;
}

/** A completion with its lines. `id` is its eight-digit business ID; `quantity` the output in `baseUnit`. */
export interface CompletionView {
  id: string;
  order: string;
  businessDate: string;
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  baseUnit: string;
  /** Nothing was produced: the inputs it used are waste (PRD-018). */
  waste: boolean;
  createdAt: Date;
  lines: CompletionLineView[];
  /** Who reversed it as a whole, or null (E11-S03). Its quantities stay as posted. */
  reversal: CompletionReversalView | null;
}

/** What a post returns: the completion, and the order's progress after it. */
export interface CompletionResult {
  completion: CompletionView;
  order: ProductionOrderView;
}

/** What a reversal returns: the completion marked reversed, the order after it, and the inverse movements. */
export interface CompletionReversalResult extends CompletionResult {
  movements: StockMovementView[];
}

/** One pinned component as the Post completion form proposes it (PRD-010). */
export interface CompletionPreviewComponent {
  material: string;
  description: string;
  baseUnit: string;
  /** The units its actual may be entered in: the base unit first, then its conversions. */
  units: string[];
  active: boolean;
  /** The pinned revision's quantity for one output base unit. */
  perOutput: string;
  expected: string;
  /** The physical balance at the order's location now: advisory, checked again when posting. */
  available: string;
}

/** What a completion of the entered output would expect, and where it would take the order. */
export interface CompletionPreview {
  order: string;
  location: string;
  quantity: string;
  baseQuantity: string;
  baseUnit: string;
  produced: string;
  target: string;
  producedAfter: string;
  exceedsTarget: boolean;
  components: CompletionPreviewComponent[];
}

/** One input line checked and converted, ready to post. */
interface ResolvedLine {
  material: Material;
  record: BaseQuantity;
  expected: string;
  extra: boolean;
}

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's production completions (E10-S02): what production made and used for one Open order.
 * Posting is one transaction (§06 "Atomic business operations"): the output and every material used
 * as one ledger posting group at the order's location, dated today (INV-004, PRD-023); the completion
 * with each line's expected, actual and variance (PRD-013/014); the order's produced quantity and
 * state; and the audit entries (R08). Expectations always come from the order's pinned revision, never
 * the BOM's current one (BOM-026, LFC-022). Completions are never changed.
 */
export class ProductionCompletionService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /** What a completion of `input` output would expect of every pinned component, and the stock there now. */
  async preview(orderId: string, input: ProductionCompletionPreviewInput): Promise<CompletionPreview> {
    const values = parseInput(productionCompletionPreviewSchema, input);
    const order = await findProductionOrder(this.em, orderId);
    assertOpen(order);
    const record = await convertToBaseQuantity(this.em, order.output, values);
    const pinned = await pinnedComponents(this.em, order);
    const materials = pinned.map(({ material }) => material);
    // A recipe has at least one component (BOM spec), so these lookups are never empty.
    const balances = await this.em.find(StockBalance, { location: order.location, material: { $in: materials } });
    const available = new Map(balances.map((balance) => [balance.material.id, balance.quantity]));
    const units = new Map(materials.map((material) => [material.id, [material.baseUnit]]));
    // Never the report-only statistical unit (#239).
    const conversions = await this.em.find(MaterialConversion, { material: { $in: materials }, unit: { $ne: STATISTICAL_UNIT } }, { orderBy: { unit: "asc" } });
    for (const { material, unit } of conversions) units.get(material.id)!.push(unit);
    const after = producedAfter(order.produced, record.baseQuantity);
    return {
      order: order.code,
      location: order.location.code,
      quantity: record.enteredQuantity,
      baseQuantity: record.baseQuantity,
      baseUnit: order.output.baseUnit,
      produced: order.produced,
      target: order.quantity,
      producedAfter: after,
      exceedsTarget: exceedsTarget(after, order.quantity),
      components: pinned.map(({ material, quantity }) => ({
        material: material.code,
        description: material.description,
        baseUnit: material.baseUnit,
        units: units.get(material.id)!,
        active: material.active,
        perOutput: quantity,
        expected: expectedConsumption(quantity, record.baseQuantity),
        available: available.get(material.id) ?? "0.000000",
      })),
    };
  }

  /** A page of the order's completions, newest first, `COMPLETION_PAGE_SIZE` to a page; a page past the last is empty. */
  async list(orderId: string, page = 1): Promise<CompletionView[]> {
    const query = parseInput(productionCompletionListSchema, { page });
    const order = await findProductionOrder(this.em, orderId);
    const completions = await this.em.find(
      ProductionCompletion,
      { order },
      { orderBy: { code: "desc" }, limit: COMPLETION_PAGE_SIZE, offset: (query.page - 1) * COMPLETION_PAGE_SIZE },
    );
    return viewsOf(this.em, order, completions);
  }

  /**
   * Posts a completion against Open order `orderId` (spec Q1–Q8). Every line is checked before anything
   * is written, and its field errors are collected into one `VALIDATION_FAILED` keyed
   * `components.N.<field>`. Too little stock is `INSUFFICIENT_STOCK`, from the posting; going past the
   * target without `acceptOverproduction` is `PRODUCTION_OVERPRODUCTION`. Any refusal writes nothing.
   * A repeated `submission` (the UI dialog's token, spec Q7) returns the completion it already posted.
   */
  post(orderId: string, input: ProductionCompletionInput, actor: AuditActor, options: { submission?: string } = {}): Promise<CompletionResult> {
    const { submission } = options;
    return this.postWith(
      orderId, input, { kind: "user", actor },
      async (em, order, completion) => ({ completion: (await viewsOf(em, order, [completion]))[0], order: productionOrderView(order) }),
      submission === undefined ? undefined : { token: submission, replay: (em) => replayed(em, orderId, submission) },
    );
  }

  /**
   * The demo seed's completion, posted and stamped at `at`, unaudited and without a submission token.
   * The same rules apply: stock, the Open order, the components and the overproduction acknowledgement.
   * It returns only the completion's ID: the seed reads nothing back, and building the views costs
   * about as much as the posting (#163, #185).
   */
  seedDemo(orderId: string, input: ProductionCompletionInput, at: Date): Promise<{ id: string }> {
    return this.postWith(orderId, input, { kind: "seed", at }, (_em, _order, completion) => ({ id: completion.code }));
  }

  /** Posts in one transaction and returns what `result` makes of it, or what `submission` already posted. */
  private async postWith<T>(
    orderId: string, input: ProductionCompletionInput, context: PostingContext,
    result: (em: EntityManager, order: ProductionOrder, completion: ProductionCompletion) => T | Promise<T>,
    submission?: { token: string; replay: (em: EntityManager) => Promise<T | null> },
  ): Promise<T> {
    const values = parseInput(productionCompletionCreateSchema, input);
    try {
      return await this.em.transactional(async (em) => {
        if (submission !== undefined) {
          const posted = await submission.replay(em);
          if (posted) return posted;
        }
        const order = await findProductionOrder(em, orderId, { refresh: true });
        assertOpen(order);
        const output = await convertOutput(em, order, values);
        const lines = await resolveLines(em, order, output.baseQuantity, values);
        const movements = (parseDecimal(output.baseQuantity)! > 0n ? 1 : 0) + lines.filter(isUsed).length;
        if (movements === 0) throw new AppError("PRODUCTION_COMPLETION_EMPTY", "A completion must produce or use something.");
        if (movements > COMPLETION_MOVEMENTS_MAX) throw new ValidationError({ components: [COMPLETION_MOVEMENTS_MESSAGE] });
        const after = producedAfter(order.produced, output.baseQuantity);
        if (exceedsTarget(after, order.quantity) && values.acceptOverproduction !== true) {
          throw new ConflictError(
            `This completion takes production order ${order.code} to ${after} ${order.output.baseUnit}, past its target of ${order.quantity}.`,
            "PRODUCTION_OVERPRODUCTION",
            { produced: order.produced, target: order.quantity, output: output.baseQuantity, unit: order.output.baseUnit },
          );
        }
        const code = nextSequentialId((await em.find(ProductionCompletion, {}, { orderBy: { code: "desc" }, limit: 1 }))[0]?.code ?? null, {
          code: "PRODUCTION_COMPLETION_IDS_EXHAUSTED",
          message: "This tenant has used every eight-digit production completion ID.",
        });
        const id = randomUUID();
        const businessDate = await postMovements(em, order, code, id, output, lines, context);
        const completion = em.create(ProductionCompletion, {
          id,
          code,
          order,
          businessDate,
          quantity: output.baseQuantity,
          enteredQuantity: output.enteredQuantity,
          enteredUnit: output.enteredUnit,
          numerator: output.numerator,
          denominator: output.denominator,
          submission: submission?.token ?? null,
          ...(context.kind === "seed" && { createdAt: context.at }),
        });
        lines.forEach(({ material, record, expected, extra }, position) => {
          em.create(ProductionCompletionLine, {
            completion,
            position,
            material,
            expected,
            actual: record.baseQuantity,
            variance: consumptionVariance(expected, record.baseQuantity),
            enteredQuantity: record.enteredQuantity,
            enteredUnit: record.enteredUnit,
            numerator: record.numerator,
            denominator: record.denominator,
            extra,
          });
        });
        progress(em, order, after, context);
        if (context.kind === "user") recordTenantAudit(em, context.actor, {
          action: "production-orders.production-completion.posted",
          subject: { type: "ProductionCompletion", id: code, label: `${code} — order ${order.code}, ${order.output.code} ${order.output.description}` },
          before: null,
          after: completionSnapshot(order, completion, lines),
        });
        await em.flush();
        return result(em, order, completion);
      });
    } catch (error) {
      // A racing completion normally surfaces as a stale snapshot, which the request wrappers retry; the
      // unique indexes and the order's version only catch what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(COMPLETION_ID_RACE, "PRODUCTION_COMPLETION_ID_RACE");
      if (error instanceof OptimisticLockError) {
        throw new ConflictError("The production order changed while the completion was posted. Try again.", "PRODUCTION_ORDER_CHANGED");
      }
      throw error;
    }
  }

  /**
   * Reverses completion `completionId` of order `orderId` as a whole, once, today (E11-S03, spec Q4/Q5):
   * every movement inverted as one group, each linked to its original, the order's produced quantity
   * lowered and a Completed order reopened below its target; a Closed Early order stays closed. Too
   * little finished output is `INSUFFICIENT_STOCK` and writes nothing (REV-012, REV-018, AUD-021).
   */
  async reverse(orderId: string, completionId: string, raw: unknown, actor: AuditActor): Promise<CompletionReversalResult> {
    const code = parseInput(businessIdSchema, completionId);
    const { reason } = parseInput(stockReversalSchema, raw);
    let postingId: string | null = null;
    try {
      return await this.em.transactional(async (em) => {
        if (await isScopeReadOnly(em)) throw new ConflictError("This tenant is read-only.", "TENANT_READ_ONLY");
        const order = await findProductionOrder(em, orderId, { refresh: true });
        const completion = await em.findOne(ProductionCompletion, { order, code });
        if (!completion) throw new NotFoundError("PRODUCTION_COMPLETION_NOT_FOUND", `Production order ${order.code} has no completion ${code}.`);
        postingId = completion.id;
        const originals = await em.find(StockMovement, { postingId: completion.id }, { populate: ["material", "location"], orderBy: { position: "asc" }, refresh: true });
        const existing = await existingReversal(em, originals);
        if (existing) throw completionAlreadyReversed(existing.inverse.postingId);
        const lines = await em.find(ProductionCompletionLine, { completion }, { orderBy: { position: "asc" } });
        assertCompletionHistory(order, completion, lines, originals);
        const movements = await postHistoricalInverses(em, originals, reason, randomUUID(), actor);
        await linkReversals(em, originals, movements);
        const before = { produced: order.produced, status: order.status };
        order.produced = subtractReversedQuantity(order.produced, completion.quantity);
        // Only an automatic completion reopens; an explicit Closed Early decision stays (spec Q5).
        if (order.status === "completed") order.status = productionStatus(order.produced, order.quantity);
        order.updatedAt = new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
        const subject = { type: "ProductionCompletion", id: completion.code, label: `${completion.code} — order ${order.code}, ${order.output.code} ${order.output.description}` };
        const pairs: Record<string, string> = {};
        originals.forEach(({ id }, index) => {
          pairs[`movement${index + 1}Original`] = id;
          pairs[`movement${index + 1}Inverse`] = movements[index].id;
        });
        recordTenantAudit(em, actor, {
          action: "production-orders.production-completion.reversed",
          subject,
          before: { reversed: false },
          after: { reversed: true, reversal: movements[0].postingId, reason, businessDate: movements[0].businessDate, movements: movements.length, ...pairs },
        });
        recordTenantAudit(em, actor, {
          action: "production-orders.production-order.completion-reversed",
          subject: productionSubject(order),
          before,
          after: { produced: order.produced, status: order.status, completion: completion.code },
        });
        await em.flush();
        return { completion: (await viewsOf(em, order, [completion]))[0], order: productionOrderView(order), movements };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException && postingId !== null) {
        // A racing reversal won past the in-transaction check: name the one that exists, read afresh.
        const existing = await existingReversal(this.em, await this.em.find(StockMovement, { postingId }, { refresh: true }));
        throw completionAlreadyReversed(existing?.inverse.postingId ?? null);
      }
      if (error instanceof OptimisticLockError) {
        throw new ConflictError("The production order changed while the completion was reversed. Try again.", "PRODUCTION_ORDER_CHANGED");
      }
      throw error;
    }
  }
}

/** Only an Open order takes a completion (spec Q3): a Completed one has nothing left to produce. */
function assertOpen(order: ProductionOrder): void {
  if (order.status !== "open") throw new ConflictError("This production order is no longer Open.", "PRODUCTION_ORDER_LOCKED");
}

/** The order's pinned revision's components, in recipe order: never the BOM's current revision (BOM-026, LFC-022). */
function pinnedComponents(em: EntityManager, order: ProductionOrder): Promise<BomComponent[]> {
  return em.find(BomComponent, { revision: order.recipe }, { populate: ["material"], orderBy: { position: "asc" } });
}

/** The completion an earlier submit of the same dialog posted, if any; a token spent on another order is refused. */
async function replayed(em: EntityManager, orderId: string, submission: string): Promise<CompletionResult | null> {
  const posted = await em.findOne(ProductionCompletion, { submission }, { populate: ["order"] });
  if (!posted) return null;
  if (posted.order.code !== orderId) throw new ValidationError({ submission: [SUBMISSION_REUSED_MESSAGE] });
  const order = await findProductionOrder(em, orderId, { refresh: true });
  return { completion: (await viewsOf(em, order, [posted]))[0], order: productionOrderView(order) };
}

/** The output converted to the output material's base unit, its refusal shown on the output's field. */
async function convertOutput(em: EntityManager, order: ProductionOrder, values: ProductionCompletionInput): Promise<BaseQuantity> {
  try {
    return await convertToBaseQuantity(em, order.output, values);
  } catch (error) {
    const [name, message] = lineError(error);
    throw new ValidationError({ [name]: [message] });
  }
}

/**
 * Matches every input line to a pinned component or an added input, converts it and checks it,
 * collecting every field error before refusing (spec Q4–Q6). Pinned components come first, in recipe
 * order, each expecting its share of `output`; added inputs follow in the order sent, expecting nothing.
 */
async function resolveLines(em: EntityManager, order: ProductionOrder, output: string, values: ProductionCompletionInput): Promise<ResolvedLine[]> {
  const pinned = await pinnedComponents(em, order);
  const errors: FieldErrors = {};
  const byMaterial = new Map<string, ResolvedLine>();
  for (const [index, line] of values.components.entries()) {
    const field = (name: string) => `components.${index}.${name}`;
    const component = pinned.find(({ material }) => material.code === line.material);
    const material = component?.material ?? (await em.findOne(Material, { code: line.material }));
    const refusal = material ? inputRefusal(order, material, component !== undefined) : UNKNOWN_INPUT_MESSAGE;
    if (refusal !== null) {
      errors[field("material")] = [refusal];
      continue;
    }
    let record: BaseQuantity;
    try {
      record = await convertToBaseQuantity(em, material!, line);
    } catch (error) {
      const [name, message] = lineError(error);
      errors[field(name)] = [message];
      continue;
    }
    const used = parseDecimal(record.baseQuantity)! > 0n;
    if (component === undefined && !used) {
      errors[field("quantity")] = [EXTRA_INPUT_QUANTITY_MESSAGE];
      continue;
    }
    if (!material!.active && used) {
      errors[field("quantity")] = [INACTIVE_INPUT_MESSAGE];
      continue;
    }
    const expected = component === undefined ? "0.000000" : expectedConsumption(component.quantity, output);
    byMaterial.set(material!.code, { material: material!, record, expected, extra: component === undefined });
  }
  // Named in `params.material`, so an API caller learns which component it left out (#153, R07).
  const missing = pinned.filter(({ material }) => !values.components.some((line) => line.material === material.code)).map(({ material }) => material.code);
  if (missing.length > 0) errors.components = [MISSING_COMPONENT_MESSAGE];
  if (Object.keys(errors).length > 0) throw new ValidationError(errors, missing.length > 0 ? { material: missing.join(", ") } : undefined);
  const pinnedLines = pinned.map(({ material }) => byMaterial.get(material.code)!);
  return [...pinnedLines, ...[...byMaterial.values()].filter(({ extra }) => extra)];
}

/**
 * Why `material` can't be an input of `order`, or null. A pinned component is always allowed (its
 * inactivity only stops a positive actual); an added one must be an active raw or intermediate
 * material other than the output (R02, PRD-015/016/017).
 */
function inputRefusal(order: ProductionOrder, material: Material, isPinned: boolean): string | null {
  if (isPinned) return null;
  if (material.id === order.output.id) return OUTPUT_AS_INPUT_MESSAGE;
  if (material.type === "finished") return FINISHED_COMPONENT_MESSAGE;
  if (!material.active) return INACTIVE_INPUT_MESSAGE;
  return null;
}

function isUsed({ record }: ResolvedLine): boolean {
  return parseDecimal(record.baseQuantity)! > 0n;
}

/**
 * Posts the completion's one ledger group at the order's location: the output in, when anything was
 * produced, then every material used out (INV-004). The ledger refuses an overdraw of any of them
 * (PRD-020, PRD-021), and nothing of the completion is written. Returns the posting's business date.
 */
async function postMovements(em: EntityManager, order: ProductionOrder, code: string, id: string, output: BaseQuantity, lines: ResolvedLine[], context: PostingContext): Promise<string> {
  const location = order.location.code;
  const produced = parseDecimal(output.baseQuantity)! > 0n ? [{ material: order.output.code, location, quantity: output.enteredQuantity, unit: output.enteredUnit }] : [];
  const used = lines.filter(isUsed).map(({ material, record }) => ({ material: material.code, location, quantity: `-${record.enteredQuantity}`, unit: record.enteredUnit }));
  const [{ businessDate }] = await postStockMovements(
    em,
    { lines: [...produced, ...used], reason: `Production completion ${code} for production order ${order.code}` },
    { type: PRODUCTION_COMPLETION_MOVEMENT, id },
    context,
  );
  return businessDate;
}

/**
 * Advances the order's produced quantity and applies the state rule (spec Q8): Completed once it has
 * produced its target. A waste posting produces nothing, so it changes nothing and records nothing.
 */
function progress(em: EntityManager, order: ProductionOrder, produced: string, context: PostingContext): void {
  if (produced === order.produced) return;
  const before = { produced: order.produced, status: order.status };
  order.produced = produced;
  order.status = documentState([productionStatus(produced, order.quantity)]);
  order.updatedAt = context.kind === "seed" ? context.at : new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1));
  if (context.kind === "user") recordTenantAudit(em, context.actor, {
    action: "production-orders.production-order.progressed",
    subject: productionSubject(order),
    before,
    after: { produced: order.produced, status: order.status },
  });
}

/** The completion's allowlisted audit snapshot: flat scalars, one set of keys per line (`line1Material`, …). */
function completionSnapshot(order: ProductionOrder, completion: ProductionCompletion, lines: readonly ResolvedLine[]) {
  const snapshot: Record<string, string | number | boolean> = {
    id: completion.code,
    order: order.code,
    output: order.output.code,
    location: order.location.code,
    bom: order.recipe.bom.code,
    revision: order.recipe.number,
    quantity: completion.quantity,
    enteredQuantity: completion.enteredQuantity,
    enteredUnit: completion.enteredUnit,
    businessDate: completion.businessDate,
    lines: lines.length,
  };
  lines.forEach(({ material, record, expected, extra }, index) => {
    const number = index + 1;
    snapshot[`line${number}Material`] = material.code;
    snapshot[`line${number}Expected`] = expected;
    snapshot[`line${number}Actual`] = record.baseQuantity;
    snapshot[`line${number}Variance`] = consumptionVariance(expected, record.baseQuantity);
    snapshot[`line${number}Extra`] = extra;
  });
  return snapshot;
}

/** The views of `completions`, all of `order`, with their lines read in one query. */
async function viewsOf(em: EntityManager, order: ProductionOrder, completions: readonly ProductionCompletion[]): Promise<CompletionView[]> {
  if (completions.length === 0) return [];
  const lines = await em.find(ProductionCompletionLine, { completion: { $in: [...completions] } }, { populate: ["material"], orderBy: { position: "asc" } });
  const byCompletion = new Map<string, ProductionCompletionLine[]>(completions.map(({ id }) => [id, []]));
  const reversals = await completionReversals(em, completions);
  for (const line of lines) byCompletion.get(line.completion.id)!.push(line);
  return completions.map((completion) => ({
    id: completion.code,
    order: order.code,
    businessDate: completion.businessDate,
    quantity: completion.quantity,
    enteredQuantity: completion.enteredQuantity,
    enteredUnit: completion.enteredUnit,
    baseUnit: order.output.baseUnit,
    waste: parseDecimal(completion.quantity) === 0n,
    createdAt: completion.createdAt,
    lines: byCompletion
      .get(completion.id)!
      .map(({ material, expected, actual, variance, enteredQuantity, enteredUnit, extra }) => ({
        material: material.code,
        baseUnit: material.baseUnit,
        expected,
        actual,
        variance,
        enteredQuantity,
        enteredUnit,
        extra,
      })),
    reversal: reversals.get(completion.id) ?? null,
  }));
}
