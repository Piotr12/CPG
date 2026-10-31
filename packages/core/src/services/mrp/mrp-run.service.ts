import { currentTenant, holdWriteGate, MrpDailyResult, MrpRun, type EntityManager } from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import type { MrpBucket, MrpResult } from "../../domain/mrp/mrp-result";
import { planMrp } from "../../domain/mrp/plan-mrp";
import { summarizePlan } from "../../domain/mrp/report/plan-summary";
import { MRP_HORIZON_DAYS } from "../../domain/mrp/projection/horizon";
import { formatSignedQuantity } from "../../domain/stock/signed-quantity";
import { ConflictError, NotFoundError } from "../../http/errors";
import { parseInput } from "../../http/parse-input";
import { inRequestTransaction } from "../../http/request-transaction";
import { yieldToEventLoop } from "../../http/yield-to-event-loop";
import { MRP_LATEST_PAGE_SIZE, mrpLatestQuerySchema } from "../../validators/mrp/mrp-latest.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit } from "../audit/audit-recorder";
import { findLocation, locationsByCode } from "../locations/find-location";
import { findMaterial, materialsByCode } from "../materials/find-material";
import type { TenantService } from "../tenants/tenant.service";
import type { MrpSnapshotService } from "./mrp-snapshot.service";
import { MRP_FIGURES, toRunView, type MrpBucketView, type MrpFigure, type MrpLatestView, type MrpPlanView, type MrpRunView } from "./mrp-run-view";

/**
 * Daily rows per flush. Every flush walks the identity map, so the rows are written in chunks and the
 * map cleared after each (lesson 2026-10-22, "Bulk writes"); the server reads its sockets in between.
 */
export const MRP_ROW_CHUNK = 500;

export const MRP_RUN_NOT_FOUND = "No MRP run exists in this tenant yet.";
export const MRP_RUN_SUPERSEDED = "This MRP run is not the latest one any more. Read the latest run from its first page.";

interface Deps {
  em: EntityManager;
  tenantService: TenantService;
  mrpSnapshotService: MrpSnapshotService;
}

const bucketFigures = (bucket: MrpBucket) =>
  Object.fromEntries(MRP_FIGURES.map((figure) => [figure, formatSignedQuantity(bucket[figure])])) as Record<MrpFigure, string>;

/**
 * On-demand MRP runs of one tenant (E14-S02, PRD §04): a run plans every location over 90 days from
 * today and stores itself with its daily results; the latest run is shown until a newer one
 * supersedes it. A run writes only its own two tables and its audit entry (R10).
 */
export class MrpRunService {
  private readonly em: EntityManager;
  private readonly tenantService: TenantService;
  private readonly mrpSnapshotService: MrpSnapshotService;

  constructor({ em, tenantService, mrpSnapshotService }: Deps) {
    this.em = em;
    this.tenantService = tenantService;
    this.mrpSnapshotService = mrpSnapshotService;
  }

  /**
   * Runs MRP and stores the run. Must run inside the caller's write transaction (`tenantServerAction`,
   * or `IdempotencyService.run` behind `tenantApiWrite`), which has already refused a stale generation
   * and a read-only tenant. The write gate is taken first, before the snapshot: the snapshot yields to
   * the event loop, and every transaction another connection starts meanwhile then waits for this run
   * instead of making its snapshot stale or meeting a locked database (spec, "The run").
   */
  async run(actor: AuditActor): Promise<MrpRunView> {
    await holdWriteGate(this.em);
    const today = new Date().toISOString().slice(0, 10);
    const { generation } = await this.tenantService.currentState(currentTenant(this.em)!);
    const result = planMrp(await this.mrpSnapshotService.load(today), today);
    const highest = await this.em.findOne(MrpRun, {}, { orderBy: { code: "desc" }, fields: ["code"], disableIdentityMap: true });
    const code = nextSequentialId(highest?.code ?? null, { code: "MRP_RUN_IDS_EXHAUSTED", message: "This tenant has used every eight-digit MRP run ID." });
    // Only the latest run keeps its results (spec Q1). Deleting them before the insert keeps the index small.
    await this.em.nativeDelete(MrpDailyResult, {});
    const run = this.em.create(MrpRun, {
      code,
      startDate: today,
      horizonDays: MRP_HORIZON_DAYS,
      mode: "manual",
      generation,
      pairs: result.plans.length,
      actorUserId: actor.userId,
      actorUsername: actor.username,
      channel: actor.channel,
    });
    recordTenantAudit(this.em, actor, {
      // One entry per run (spec Q3): the run is a new tenant record, though it changes no business record (R10).
      action: "mrp.mrp-run.created",
      subject: { type: "MrpRun", id: code, label: code },
      before: null,
      after: { date: today, generation },
    });
    await this.em.flush();
    const view = toRunView(run);
    await this.writeResults(run, result);
    return view;
  }

  /**
   * The last MRP report (E18-S01): the latest run and one page of its plans (`mrpLatestQuerySchema`),
   * read in one transaction so a run committing in between can't pair this run's header with no rows.
   * The page and `GET …/mrp/runs/latest` both read it, so the screen and the API show the same figures.
   *
   * A `material` or `location` filter narrows the plans; one this tenant doesn't have is
   * `MATERIAL_NOT_FOUND` / `LOCATION_NOT_FOUND`, checked before the run. With `run` (and, since a Test
   * reset restarts run IDs, `generation`), a newer run is `MRP_RUN_SUPERSEDED`, so a client paging
   * through results never mixes two runs; a run ID past the latest is `MRP_RUN_NOT_FOUND`.
   */
  async latest(raw: Record<string, unknown>): Promise<MrpLatestView> {
    const query = parseInput(mrpLatestQuerySchema, raw);
    return inRequestTransaction(this.em, async () => {
      if (query.material !== undefined) await findMaterial(this.em, query.material);
      if (query.location !== undefined) await findLocation(this.em, query.location);
      const run = await this.latestRun();
      if (!run) throw new NotFoundError("MRP_RUN_NOT_FOUND", MRP_RUN_NOT_FOUND);
      if (query.run !== undefined) {
        const otherGeneration = query.generation !== undefined && query.generation !== run.generation;
        if (!otherGeneration && query.run > run.code) throw new NotFoundError("MRP_RUN_NOT_FOUND", MRP_RUN_NOT_FOUND);
        if (otherGeneration || query.run < run.code) throw new ConflictError(MRP_RUN_SUPERSEDED, "MRP_RUN_SUPERSEDED", { run: query.run });
      }
      // Every pair has exactly `horizonDays` rows, so the offset falls on pair boundaries, and the
      // unique `(tenant, run, material, location, date)` index serves the filters and the order alike.
      const where = { run, ...(query.material !== undefined && { material: query.material }), ...(query.location !== undefined && { location: query.location }) };
      const filtered = query.material !== undefined || query.location !== undefined;
      const total = filtered ? (await this.em.count(MrpDailyResult, where)) / run.horizonDays : run.pairs;
      const days = MRP_LATEST_PAGE_SIZE * run.horizonDays;
      const rows = await this.em.find(
        MrpDailyResult,
        where,
        {
          orderBy: { material: "asc", location: "asc", date: "asc" },
          limit: days,
          offset: (query.page - 1) * days,
          fields: ["material", "location", "date", ...MRP_FIGURES],
          disableIdentityMap: true,
        },
      );
      return { run: toRunView(run), page: query.page, pageSize: MRP_LATEST_PAGE_SIZE, total, plans: await this.describe(groupPlans(rows)) };
    });
  }

  /**
   * Each plan with what the report shows beside its days: the material's description and base unit,
   * the location's name, both active flags, and the summary. Masters are never deleted, and a Test reset
   * clears Test's runs, so every ID a run names resolves.
   */
  private async describe(plans: GroupedPlan[]): Promise<MrpPlanView[]> {
    if (plans.length === 0) return [];
    const materials = await materialsByCode(this.em, plans.map((plan) => plan.material));
    const locations = await locationsByCode(this.em, plans.map((plan) => plan.location));
    return plans.map(({ material, location, buckets }) => {
      const { description, active, baseUnit } = materials.get(material)!;
      const site = locations.get(location)!;
      return {
        material, materialDescription: description, materialActive: active, baseUnit,
        location, locationName: site.name, locationActive: site.active,
        ...summarizePlan(buckets as [MrpBucketView, ...MrpBucketView[]]),
        buckets,
      };
    });
  }

  private latestRun(): Promise<MrpRun | null> {
    return this.em.findOne(MrpRun, {}, { orderBy: { code: "desc" } });
  }

  /** Inserts every planned day in chunks, yielding between them; the run is re-loaded after each `em.clear()`. */
  private async writeResults(stored: MrpRun, { plans }: MrpResult): Promise<void> {
    let run = stored;
    let pending = 0;
    for (const { material, location, buckets } of plans) {
      for (const bucket of buckets) {
        this.em.create(MrpDailyResult, { run, material, location, date: bucket.date, ...bucketFigures(bucket) });
        pending += 1;
        if (pending < MRP_ROW_CHUNK) continue;
        await this.em.flush();
        this.em.clear();
        await yieldToEventLoop();
        // A cleared reference would fail `TenantGuard`, which accepts only records loaded through the scope.
        run = await this.em.findOneOrFail(MrpRun, run.id);
        pending = 0;
      }
    }
    await this.em.flush();
    this.em.clear();
  }
}

/** One pair's days, before `describe` names it. */
type GroupedPlan = Pick<MrpPlanView, "material" | "location" | "buckets">;

/** Rows ordered by material, location and date, as one plan per pair. */
function groupPlans(rows: readonly Pick<MrpDailyResult, "material" | "location" | "date" | MrpFigure>[]): GroupedPlan[] {
  const plans: GroupedPlan[] = [];
  for (const row of rows) {
    let plan = plans.at(-1);
    if (!plan || plan.material !== row.material || plan.location !== row.location) {
      plan = { material: row.material, location: row.location, buckets: [] };
      plans.push(plan);
    }
    plan.buckets.push({ date: row.date, ...(Object.fromEntries(MRP_FIGURES.map((figure) => [figure, row[figure]])) as Record<MrpFigure, string>) } satisfies MrpBucketView);
  }
  return plans;
}
