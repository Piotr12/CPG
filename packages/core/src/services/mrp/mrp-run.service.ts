import { currentTenant, holdWriteGate, MrpDailyResult, MrpRecommendation, MrpRun, MrpRunException, type EntityManager } from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { mrpExceptionMessage } from "../../domain/mrp/exceptions/codes";
import { exceptionParams, toStoredException } from "../../domain/mrp/exceptions/stored-exception";
import { isMrpProvisionalCode, readStoredProvisional, toStoredProvisional } from "../../domain/mrp/provisional/stored-provisional";
import type { MrpBucket, MrpResult } from "../../domain/mrp/mrp-result";
import { isExecutableProposal } from "../../domain/mrp/acceptance/executable-proposal";
import { planMrp } from "../../domain/mrp/plan-mrp";
import { exceptionRejections, isMrpBomRejectionsCode, readBomRejections, toStoredBomRejections, type MrpBomRejectionView } from "../../domain/mrp/report/bom-rejections";
import { planMarks, type StoredWarningRow } from "../../domain/mrp/report/plan-marks";
import { summarizePlan } from "../../domain/mrp/report/plan-summary";
import { foldWeeks } from "../../domain/mrp/report/weekly";
import { MRP_HORIZON_DAYS } from "../../domain/mrp/projection/horizon";
import { pairKey } from "../../domain/mrp/projection/pairs";
import { scheduleProposal } from "../../domain/mrp/sizing/schedule-proposal";
import { isMrpWarningCode, toStoredWarning } from "../../domain/mrp/warnings/overdue";
import { formatDecimal } from "../../domain/quantities/decimal";
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
import {
  MRP_FIGURES,
  toRunView,
  type MrpBucketView,
  type MrpExceptionView,
  type MrpFigure,
  type MrpLatestView,
  type MrpPlanView,
  type MrpProposalView,
  type MrpProvisionalView,
  type MrpRunView,
} from "./mrp-run-view";

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
 * supersedes it. A run writes only its own four tables (the run, its daily results, its
 * recommendations, E16-S01, and its exceptions, E16-S03, with its warnings, E18-S02, its provisional
 * actions, E17-S03, and its fallbacks' rejected BOMs, E18-S03) and its audit entry (R10).
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
    // The engine is one synchronous stretch, and so are the deletes after it on better-sqlite3: yield between
    // them, so the server reads its sockets (lesson 2026-10-24). The write gate is already held.
    await yieldToEventLoop();
    const highest = await this.em.findOne(MrpRun, {}, { orderBy: { code: "desc" }, fields: ["code"], disableIdentityMap: true });
    const code = nextSequentialId(highest?.code ?? null, { code: "MRP_RUN_IDS_EXHAUSTED", message: "This tenant has used every eight-digit MRP run ID." });
    // Only the latest run keeps its results, proposals and exceptions (spec Q1). Deleting them before the insert keeps the indexes small.
    await this.em.nativeDelete(MrpDailyResult, {});
    await this.em.nativeDelete(MrpRecommendation, {});
    await this.em.nativeDelete(MrpRunException, {});
    await yieldToEventLoop();
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
      const plans = groupPlans(rows);
      const proposals = await this.proposalsOf(run, plans, query.location);
      const stored = await this.exceptionsOf(run, plans, query.location);
      const described = await this.describe(plans, proposals, stored, query.bucket === "week");
      return { run: toRunView(run), bucket: query.bucket, page: query.page, pageSize: MRP_LATEST_PAGE_SIZE, total, plans: described };
    });
  }

  /**
   * Each plan with what the report shows beside its days: the material's description and base unit,
   * the location's name, both active flags, the summary, its marks (E18-S02), and its weeks when the
   * read asked for them. Masters are never deleted, and a Test reset
   * clears Test's runs, so every ID a run names resolves.
   */
  private async describe(
    plans: GroupedPlan[],
    proposals: ReadonlyMap<string, StoredProposal[]>,
    { exceptions, warnings, provisional, rejections }: StoredRows,
    weekly: boolean,
  ): Promise<MrpPlanView[]> {
    if (plans.length === 0) return [];
    const materials = await materialsByCode(this.em, plans.map((plan) => plan.material));
    const locations = await locationsByCode(this.em, plans.map((plan) => plan.location));
    return plans.map(({ material, location, buckets }) => {
      const { description, active, baseUnit } = materials.get(material)!;
      const site = locations.get(location)!;
      const key = pairKey(material, location);
      // `proposalsOf` and `exceptionsOf` key every plan of the page, with or without rows.
      const rejected = rejections.get(key)!;
      // A fallback's rejections attach to its proposal: one per pair and need date (E18-S03 spec Q1).
      const planned = proposals.get(key)!.map((proposal) => ({ ...proposal, rejectedBoms: rejected.get(proposal.needDate) ?? [] }));
      const marks = planMarks(planned, warnings.get(key)!);
      return {
        material, materialDescription: description, materialActive: active, baseUnit,
        location, locationName: site.name, locationActive: site.active,
        ...summarizePlan(buckets as [MrpBucketView, ...MrpBucketView[]]),
        buckets,
        proposals: planned,
        exceptions: exceptions.get(key)!,
        provisional: provisional.get(key)!,
        marks,
        ...(weekly && { weeks: foldWeeks(buckets, marks) }),
      };
    });
  }

  /**
   * The page's proposals by pair, in one read through the unique `(tenant, run, material, location,
   * need_date)` index. The page is contiguous in material and location order, so only its first and
   * last material can have pairs off the page; those rows are read and dropped here.
   */
  private async proposalsOf(run: MrpRun, plans: GroupedPlan[], location: string | undefined): Promise<Map<string, StoredProposal[]>> {
    const byPair = new Map<string, StoredProposal[]>(plans.map((plan) => [pairKey(plan.material, plan.location), []]));
    if (plans.length === 0) return byPair;
    const materials = [...new Set(plans.map((plan) => plan.material))];
    const rows = await this.em.find(
      MrpRecommendation,
      { run, material: { $in: materials }, ...(location !== undefined && { location }) },
      {
        orderBy: { material: "asc", location: "asc", needDate: "asc" },
        fields: ["id", "material", "location", "kind", "needDate", "quantity", "leadTimeDays", "acceptedDocument", "bom", "bomRevision"],
        disableIdentityMap: true,
      },
    );
    for (const { id, material, location: site, kind, needDate, quantity, leadTimeDays, acceptedDocument, bom, bomRevision } of rows) {
      // The engine's own timing rule, from the run's first day (E16-S02): one rule for the plan and its read.
      byPair.get(pairKey(material, site))?.push({
        id, kind, needDate, quantity, ...scheduleProposal(needDate, leadTimeDays, run.startDate, run.horizonDays),
        executable: isExecutableProposal(kind), document: acceptedDocument ?? null, bom: bom ?? null, bomRevision: bomRevision ?? null,
      });
    }
    return byPair;
  }

  /**
   * The page's exceptions, warnings and provisional actions by pair, in run order, read like `proposalsOf`
   * through the unique `(tenant, run, material, location, position)` index. A code this image doesn't know,
   * written by a newer one before a rollback, is listed with the fallback message (spec Q7). Warnings share
   * the table but are never exceptions (E18-S02, spec Q1): they become the report's marks. Neither are
   * provisional actions (E17-S03 spec Q8), each timed by the engine's own rule from the run's first day, nor a
   * fallback's rejected BOMs (E18-S03 spec Q1), kept by need date for its proposal.
   */
  private async exceptionsOf(run: MrpRun, plans: GroupedPlan[], location: string | undefined): Promise<StoredRows> {
    const keyed = <T>() => new Map<string, T[]>(plans.map((plan) => [pairKey(plan.material, plan.location), []]));
    const byPair = keyed<MrpExceptionView>();
    const warnings = keyed<StoredWarningRow>();
    const provisional = keyed<MrpProvisionalView>();
    const rejections = new Map(plans.map((plan) => [pairKey(plan.material, plan.location), new Map<string, MrpBomRejectionView[]>()]));
    if (plans.length === 0) return { exceptions: byPair, warnings, provisional, rejections };
    const materials = [...new Set(plans.map((plan) => plan.material))];
    const rows = await this.em.find(
      MrpRunException,
      { run, material: { $in: materials }, ...(location !== undefined && { location }) },
      { orderBy: { material: "asc", location: "asc", position: "asc" }, fields: ["material", "location", "exceptionCode", "date", "details"], disableIdentityMap: true },
    );
    for (const row of rows) {
      if (isMrpBomRejectionsCode(row.exceptionCode)) {
        rejections.get(pairKey(row.material, row.location))?.set(row.date!, readBomRejections(row.details as Record<string, string>));
        continue;
      }
      if (isMrpProvisionalCode(row.exceptionCode)) {
        const { leadTimeDays, ...read } = readStoredProvisional(row.date!, row.details!);
        const timing = scheduleProposal(read.needDate, leadTimeDays, run.startDate, run.horizonDays);
        provisional.get(pairKey(row.material, row.location))?.push({ kind: "production-order", ...read, ...timing, rejectedBoms: readBomRejections(read) });
        continue;
      }
      if (isMrpWarningCode(row.exceptionCode)) {
        warnings.get(pairKey(row.material, row.location))?.push({ code: row.exceptionCode, date: row.date ?? null, details: row.details ?? null });
        continue;
      }
      const params = exceptionParams({ material: row.material, location: row.location, date: row.date ?? null, details: row.details ?? null });
      const rejectedBoms = exceptionRejections(row.exceptionCode, row.details ?? null);
      byPair.get(pairKey(row.material, row.location))?.push({ code: row.exceptionCode, message: mrpExceptionMessage(row.exceptionCode), params, ...(rejectedBoms && { rejectedBoms }) });
    }
    return { exceptions: byPair, warnings, provisional, rejections };
  }

  private latestRun(): Promise<MrpRun | null> {
    return this.em.findOne(MrpRun, {}, { orderBy: { code: "desc" } });
  }

  /**
   * Inserts every planned day, then every proposal, then every exception, every warning, every provisional
   * action and every fallback's rejected BOMs at its position in the run's order, in chunks, yielding between them; the run is re-loaded after each `em.clear()`.
   * Proposals are above zero, so they go through `formatDecimal`.
   */
  private async writeResults(stored: MrpRun, { plans, proposals, exceptions, warnings, provisional }: MrpResult): Promise<void> {
    let run = stored;
    let pending = 0;
    const created = async () => {
      pending += 1;
      if (pending < MRP_ROW_CHUNK) return;
      await this.em.flush();
      this.em.clear();
      await yieldToEventLoop();
      // A cleared reference would fail `TenantGuard`, which accepts only records loaded through the scope.
      run = await this.em.findOneOrFail(MrpRun, run.id);
      pending = 0;
    };
    for (const { material, location, buckets } of plans) {
      for (const bucket of buckets) {
        this.em.create(MrpDailyResult, { run, material, location, date: bucket.date, ...bucketFigures(bucket) });
        await created();
      }
    }
    for (const { kind, material, location, needDate, quantity, leadTimeDays, bom, bomRevision } of proposals) {
      this.em.create(MrpRecommendation, { run, material, location, kind, needDate, quantity: formatDecimal(quantity, { fixed: true }), leadTimeDays, bom, bomRevision });
      await created();
    }
    for (const [position, exception] of exceptions.entries()) {
      const { code: exceptionCode, ...stored } = toStoredException(exception);
      this.em.create(MrpRunException, { run, position, exceptionCode, ...stored });
      await created();
    }
    // Warnings follow every exception, so each exception keeps the position it had before them (E18-S02).
    for (const [index, warning] of warnings.entries()) {
      const { code: exceptionCode, ...stored } = toStoredWarning(warning);
      this.em.create(MrpRunException, { run, position: exceptions.length + index, exceptionCode, ...stored });
      await created();
    }
    // Provisional actions follow every warning, so each exception and warning keeps its position (E17-S03 spec Q8).
    for (const [index, action] of provisional.entries()) {
      const { code: exceptionCode, ...stored } = toStoredProvisional(action);
      this.em.create(MrpRunException, { run, position: exceptions.length + warnings.length + index, exceptionCode, ...stored });
      await created();
    }
    // A fallback's rejected BOMs follow every provisional action, so each earlier row keeps its position (E18-S03 spec Q1).
    let position = exceptions.length + warnings.length + provisional.length;
    for (const proposal of proposals) {
      const rejected = toStoredBomRejections(proposal);
      if (!rejected) continue;
      const { code: exceptionCode, ...stored } = rejected;
      this.em.create(MrpRunException, { run, position: position++, exceptionCode, ...stored });
      await created();
    }
    await this.em.flush();
    this.em.clear();
  }
}

/** The page's stored rows beside its proposals, by pair (`exceptionsOf`). */
interface StoredRows {
  exceptions: Map<string, MrpExceptionView[]>;
  warnings: Map<string, StoredWarningRow[]>;
  provisional: Map<string, MrpProvisionalView[]>;
  /** Each pair's fallbacks' rejected BOMs, by need date (E18-S03). */
  rejections: Map<string, Map<string, MrpBomRejectionView[]>>;
}

/** A stored proposal as `proposalsOf` reads it, before `describe` attaches its rejected BOMs. */
type StoredProposal = Omit<MrpProposalView, "rejectedBoms">;

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
