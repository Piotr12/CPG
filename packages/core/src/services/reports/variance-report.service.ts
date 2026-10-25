import {
  Material,
  ProductionCompletion,
  ProductionCompletionLine,
  ProductionOrder,
  StockReversal,
  type DocumentState,
  type EntityManager,
  type Location,
} from "@cpg/db";
import { OrderTally } from "../../domain/reports/variance-report-rows";
import { parseDecimal } from "../../domain/quantities/decimal";
import { parseInput } from "../../http/parse-input";
import { VARIANCE_REPORT_PAGE_SIZE, varianceReportQuerySchema, type VarianceReportQuery } from "../../validators/reports/variance-report.schema";
import { findLocation } from "../locations/find-location";
import { findMaterial } from "../materials/find-material";
import { PRODUCTION_COMPLETION_MOVEMENT } from "../production-orders/production-completion.service";

/** How many completions, orders or lines one read holds, so the identity map and the `$in` lists stay bounded. */
const BATCH = 500;

/** What a row shows of a component's material. */
type LineMaterial = Pick<Material, "code" | "description" | "baseUnit">;

/** One component of a row: its figures summed over the order's counted completions, in its base unit (spec Q3). */
export interface VarianceReportComponent {
  material: string;
  description: string;
  baseUnit: string;
  /** Not in the order's pinned revision: an added input, expecting nothing (PRD-015). */
  extra: boolean;
  expected: string;
  actual: string;
  /** Signed: actual − expected. */
  variance: string;
  /** The part of `actual` posted by zero-output completions (PRD-018). */
  waste: string;
}

/** One production order of the report (spec Q2): its target against what its counted completions produced and used. */
export interface VarianceReportRow {
  id: string;
  output: string;
  outputDescription: string;
  baseUnit: string;
  location: string;
  locationName: string;
  status: DocumentState;
  bom: string;
  revision: number;
  target: string;
  produced: string;
  /** Signed: produced − target; null under a date range, which sees only part of the output. */
  outputVariance: string | null;
  completions: number;
  wasteCompletions: number;
  /** The business IDs of the order's reversed completions in the range, counted nowhere (REV-011, REV-014). */
  reversed: string[];
  components: VarianceReportComponent[];
}

/** One page of the report, and the server's UTC date it is as of. */
export interface VarianceReportView {
  asOf: string;
  page: number;
  pageSize: number;
  total: number;
  rows: VarianceReportRow[];
}

/** What the report keeps of a completion in the range while it decides the rows: primitives only (spec Q8). */
interface CompletionRef {
  id: string;
  code: string;
  quantity: string;
  reversed: boolean;
}

/** An order with completions in the range: its UUID, its business ID, and those completions. */
interface OrderRef {
  id: string;
  code: string;
  completions: CompletionRef[];
}

const chunks = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / BATCH) }, (_, index) => items.slice(index * BATCH, (index + 1) * BATCH));

const isCounted = ({ reversed }: CompletionRef) => !reversed;

/**
 * The production variance report (E13-S02): each order's target and pinned-recipe expectations against
 * what its completions produced and used, read at request time and written nowhere. It sums the
 * figures each completion stored (expected, actual, variance), never recomputing them from the recipe,
 * and counts no reversed completion (spec Q5). No cost or capacity figure exists here (N01, N04).
 */
export class VarianceReportService {
  private readonly em: EntityManager;
  constructor({ em }: { em: EntityManager }) {
    this.em = em;
  }

  /**
   * `raw` is the query as sent, text values (`varianceReportQuerySchema`). A filter naming a material or
   * location this tenant doesn't have is `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND` (R05).
   */
  async read(raw: Record<string, unknown>): Promise<VarianceReportView> {
    const query = parseInput(varianceReportQuerySchema, raw);
    const material = query.material === undefined ? undefined : await findMaterial(this.em, query.material);
    const location = query.location === undefined ? undefined : await findLocation(this.em, query.location);
    const kept = (await this.ordersInRange(query, location, material)).sort((a, b) => (a.code < b.code ? -1 : 1));
    const page = kept.slice((query.page - 1) * VARIANCE_REPORT_PAGE_SIZE, query.page * VARIANCE_REPORT_PAGE_SIZE);
    const partial = query.from !== undefined || query.to !== undefined;
    return {
      asOf: new Date().toISOString().slice(0, 10),
      page: query.page,
      pageSize: VARIANCE_REPORT_PAGE_SIZE,
      total: kept.length,
      rows: await this.rows(page, partial),
    };
  }

  /**
   * The orders with a completion in the range under the order filters, each with those completions
   * marked reversed or not (spec Q1, Q5). With a `material` filter, an order stays when it makes that
   * material or a counted completion in the range has a line of it with a non-zero figure (spec Q6).
   */
  private async ordersInRange(query: VarianceReportQuery, location?: Location, material?: Material): Promise<OrderRef[]> {
    const posted = query.from !== undefined || query.to !== undefined
      ? { businessDate: { ...(query.from !== undefined && { $gte: query.from }), ...(query.to !== undefined && { $lte: query.to }) } }
      : {};
    const order = location !== undefined || query.status !== undefined
      ? { order: { ...(location && { location }), ...(query.status !== undefined && { status: query.status }) } }
      : {};
    const byOrder = new Map<string, CompletionRef[]>();
    const usesMaterial = new Set<string>();
    let after: string | undefined;
    for (;;) {
      const batch = await this.em.find(
        ProductionCompletion,
        { ...posted, ...order, ...(after !== undefined && { id: { $gt: after } }) },
        { orderBy: { id: "asc" }, limit: BATCH, disableIdentityMap: true },
      );
      const reversed = await reversedCompletions(this.em, batch.map(({ id }) => id));
      const refs = batch.map(({ id, code, quantity }) => ({ id, code, quantity, reversed: reversed.has(id) }));
      if (material) for (const id of await this.usingMaterial(refs.filter(isCounted), material)) usesMaterial.add(id);
      batch.forEach((completion, index) => {
        const completions = byOrder.get(completion.order.id) ?? [];
        completions.push(refs[index]);
        byOrder.set(completion.order.id, completions);
      });
      if (batch.length < BATCH) break;
      after = batch.at(-1)!.id;
    }
    // Each order's business ID and output, kept as primitives like the completions.
    const records = new Map<string, { code: string; output: string }>();
    for (const ids of chunks([...byOrder.keys()])) {
      for (const { id, code, output } of await this.em.find(ProductionOrder, { id: { $in: ids } }, { disableIdentityMap: true })) records.set(id, { code, output: output.id });
    }
    // In the order the completions' UUIDs met them, which says nothing about business IDs: the caller sorts.
    return [...byOrder.entries()]
      .map(([id, completions]) => ({ id, ...records.get(id)!, completions }))
      .filter(({ output, completions }) => !material || output === material.id || completions.some(({ id }) => usesMaterial.has(id)))
      .map(({ id, code, completions }) => ({ id, code, completions }));
  }

  /** Which of `completions` have a line of `material` that expected or used something (a pinned line is stored even when unused). */
  private async usingMaterial(completions: readonly CompletionRef[], material: Material): Promise<string[]> {
    if (completions.length === 0) return [];
    const lines = await this.em.find(ProductionCompletionLine, { completion: { $in: completions.map(({ id }) => id) }, material }, { disableIdentityMap: true });
    return lines.filter(({ expected, actual }) => parseDecimal(expected)! > 0n || parseDecimal(actual)! > 0n).map(({ completion }) => completion.id);
  }

  /** The rows of one page of orders: each order's counted completions tallied as their lines are read (spec Q2–Q5, Q8). */
  private async rows(page: readonly OrderRef[], partial: boolean): Promise<VarianceReportRow[]> {
    if (page.length === 0) return [];
    const records = await this.em.find(ProductionOrder, { id: { $in: page.map(({ id }) => id) } }, { populate: ["output", "location", "recipe.bom"] });
    const tallies = new Map(page.map(({ id }) => [id, new OrderTally()]));
    // Each counted completion's order and whether it is a waste posting, for the lines that arrive below.
    const counted = new Map<string, { tally: OrderTally; waste: boolean }>();
    for (const { id, completions } of page) {
      const tally = tallies.get(id)!;
      for (const completion of completions.filter(isCounted)) counted.set(completion.id, { tally, waste: tally.addCompletion(completion.quantity) });
    }
    const materials = await this.tallyLines(counted);
    const codeOf = (id: string) => materials.get(id)!.code;
    const byCode = new Map([...materials.values()].map((record) => [record.code, record]));
    const recordsById = new Map(records.map((record) => [record.id, record]));

    return page.map(({ id, completions }) => {
      const order = recordsById.get(id)!;
      const figures = tallies.get(id)!.figures(order.quantity, codeOf, { partial });
      return {
        id: order.code,
        output: order.output.code,
        outputDescription: order.output.description,
        baseUnit: order.output.baseUnit,
        location: order.location.code,
        locationName: order.location.name,
        status: order.status as DocumentState,
        bom: order.recipe.bom.code,
        revision: order.recipe.number,
        target: order.quantity,
        ...figures,
        reversed: completions.filter(({ reversed }) => reversed).map(({ code }) => code).sort(),
        components: figures.components.map((component) => {
          const { description, baseUnit } = byCode.get(component.material)!;
          return { ...component, description, baseUnit };
        }),
      };
    });
  }

  /**
   * Adds every line of the `counted` completions to its order's tally, in keyset batches without the
   * identity map, and returns the materials the lines name, by UUID. The materials come with their
   * lines, joined by primary key: a read of them by `id IN` would walk every material of the tenant (#257).
   */
  private async tallyLines(counted: ReadonlyMap<string, { tally: OrderTally; waste: boolean }>): Promise<Map<string, LineMaterial>> {
    const materials = new Map<string, LineMaterial>();
    for (const ids of chunks([...counted.keys()])) {
      let after: string | undefined;
      for (;;) {
        const batch = await this.em.find(
          ProductionCompletionLine,
          { completion: { $in: ids }, ...(after !== undefined && { id: { $gt: after } }) },
          {
            populate: ["material"],
            fields: ["completion", "position", "extra", "expected", "actual", "variance", "material.code", "material.description", "material.baseUnit"],
            orderBy: { id: "asc" },
            limit: BATCH,
            disableIdentityMap: true,
          },
        );
        for (const { completion, material, position, extra, expected, actual, variance } of batch) {
          const { tally, waste } = counted.get(completion.id)!;
          tally.addLine({ material: material.id, position, extra, expected, actual, variance }, waste);
          materials.set(material.id, { code: material.code, description: material.description, baseUnit: material.baseUnit });
        }
        if (batch.length < BATCH) break;
        after = batch.at(-1)!.id;
      }
    }
    return materials;
  }
}

/**
 * Which of the completions `ids` are reversed (spec Q5): any of their stock movements, whose posting ID
 * is the completion's own, is the original of a reversal link (#91), as `ProductionCompletionService.reverse`
 * links every one (#92). Read from the link's side, so only the few links come back.
 */
async function reversedCompletions(em: EntityManager, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const links = await em.find(
    StockReversal,
    { original: { postingId: { $in: [...ids] }, type: PRODUCTION_COMPLETION_MOVEMENT } },
    { populate: ["original"], disableIdentityMap: true },
  );
  return new Set(links.map(({ original }) => original.postingId));
}
