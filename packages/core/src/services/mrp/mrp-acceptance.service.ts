import { holdWriteGate, MrpRecommendation, MrpRun, type EntityManager } from "@cpg/db";
import { isExecutableProposal } from "../../domain/mrp/acceptance/executable-proposal";
import { planMrp } from "../../domain/mrp/plan-mrp";
import { scheduleProposal } from "../../domain/mrp/sizing/schedule-proposal";
import { formatDecimal } from "../../domain/quantities/decimal";
import { ConflictError, NotFoundError } from "../../http/errors";
import type { AuditActor } from "../audit/actor";
import type { RequisitionView } from "../purchase-requisitions/purchase-requisition.service";
import type { MrpProposalDocumentService } from "./mrp-proposal-document.service";
import type { MrpSnapshotService } from "./mrp-snapshot.service";
import { MRP_RUN_NOT_FOUND } from "./mrp-run.service";
import type { MrpProposalView } from "./mrp-run-view";

export const MRP_PROPOSAL_NOT_FOUND = "There is no such proposal in the latest MRP run of this tenant.";
export const MRP_PROPOSAL_STALE = "This proposal is out of date: stock, documents or plans changed since the MRP run. Run MRP again.";
export const MRP_PROPOSAL_ACCEPTED = "This proposal has already been accepted.";
export const MRP_PROPOSAL_NOT_EXECUTABLE = "MRP can't create this proposal's document.";

/** A run's business ID: eight digits. */
const RUN_ID = /^\d{8}$/;
/** A recommendation's ID: a UUID, as `randomUUID` writes it. */
const PROPOSAL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An accepted proposal as it stands alone: the latest-run read's proposal, with its run and pair. */
export interface MrpAcceptedProposalView extends MrpProposalView {
  run: string;
  material: string;
  location: string;
}

/** What accepting answers (spec Q10): the proposal, now with its document, and the document it created. */
export interface MrpAcceptanceView {
  proposal: MrpAcceptedProposalView;
  document: RequisitionView;
}

interface Deps {
  em: EntityManager;
  mrpSnapshotService: MrpSnapshotService;
  mrpProposalDocumentService: MrpProposalDocumentService;
}

const notFound = () => new NotFoundError("MRP_PROPOSAL_NOT_FOUND", MRP_PROPOSAL_NOT_FOUND);
/** Stale: with the proposal's material and location when it still exists, without them once a newer run deleted it. */
const stale = (pair?: { material: string; location: string }) =>
  new ConflictError(MRP_PROPOSAL_STALE, "MRP_PROPOSAL_STALE", pair && { material: pair.material, location: pair.location });

/**
 * Accepting an MRP proposal (E19-S01, PRD §04 "Manual/auto creation", "Stale and concurrent"): one
 * confirmed proposal of the tenant's latest run becomes its document, tagged with the run, and no
 * existing document changes (R10). A Buy proposal creates an Open purchase requisition; a Make
 * proposal can't be accepted until MRP chooses its BOM (`isExecutableProposal`, spec Q1).
 */
export class MrpAcceptanceService {
  private readonly em: EntityManager;
  private readonly mrpSnapshotService: MrpSnapshotService;
  private readonly mrpProposalDocumentService: MrpProposalDocumentService;

  constructor({ em, mrpSnapshotService, mrpProposalDocumentService }: Deps) {
    this.em = em;
    this.mrpSnapshotService = mrpSnapshotService;
    this.mrpProposalDocumentService = mrpProposalDocumentService;
  }

  /**
   * Accepts proposal `proposalId` of run `runId`. Must run inside the caller's write transaction
   * (`tenantServerAction`, or `IdempotencyService.run` behind `tenantApiWrite`), which has refused a
   * stale Test generation and a read-only tenant and retries a stale SQLite snapshot once, so this is
   * safe to repeat. Every check reads; the requisition is the first write (spec, "Read first, write last").
   *
   * Just before creating, the tenant is planned again from a fresh snapshot (spec Q2): the proposal is
   * `MRP_PROPOSAL_STALE` when that plan has no proposal of the same kind, quantity and planned finish
   * (E16-S02, so a changed lead time counts) for its material, location and need date, when a newer run
   * superseded its run, or when the run started on an earlier day (Q7). A requisition this run already created counts as tentative supply, which leaves the run's
   * other proposals as they were.
   */
  async accept(runId: string, proposalId: string, actor: AuditActor): Promise<MrpAcceptanceView> {
    // Path values: malformed is unknown, never a 400, and never compared with a run ID (spec step 0).
    if (!RUN_ID.test(runId) || !PROPOSAL_ID.test(proposalId)) throw notFound();
    // Taken before the snapshot, which yields: another accept or a run then waits for this one (lesson 2026-10-24).
    await holdWriteGate(this.em);
    const run = await this.em.findOne(MrpRun, {}, { orderBy: { code: "desc" } });
    if (!run || runId > run.code) throw new NotFoundError("MRP_RUN_NOT_FOUND", MRP_RUN_NOT_FOUND);
    // A newer run deleted this run's proposals, so there is nothing left to name.
    if (runId < run.code) throw stale();
    // Refreshed: a retried attempt must see the mark another connection committed, not a cached copy (lesson 2026-10-23).
    const proposal = await this.em.findOne(MrpRecommendation, { id: proposalId, run }, { refresh: true });
    if (!proposal) throw notFound();
    if (proposal.acceptedDocument) {
      throw new ConflictError(MRP_PROPOSAL_ACCEPTED, "MRP_PROPOSAL_ACCEPTED", { document: proposal.acceptedDocument, kind: proposal.kind });
    }
    const { material, location, kind, needDate, quantity, leadTimeDays } = proposal;
    if (!isExecutableProposal(kind)) throw new ConflictError(MRP_PROPOSAL_NOT_EXECUTABLE, "MRP_PROPOSAL_NOT_EXECUTABLE", { material, location, kind });
    const today = new Date().toISOString().slice(0, 10);
    if (run.startDate !== today) throw stale(proposal);
    const fresh = planMrp(await this.mrpSnapshotService.load(today), today).proposals.find(
      (candidate) => candidate.material === material && candidate.location === location && candidate.needDate === needDate,
    );
    // The run started today (above), so the stored lead time times the proposal as the run showed it.
    const timing = scheduleProposal(needDate, leadTimeDays, run.startDate, run.horizonDays);
    if (!fresh || fresh.kind !== kind || formatDecimal(fresh.quantity, { fixed: true }) !== quantity || fresh.plannedFinish !== timing.plannedFinish) {
      throw stale(proposal);
    }

    // The document and the proposal's mark, as the automatic batch creates them (E19-S03).
    const document = await this.mrpProposalDocumentService.create(run.code, { id: proposal.id, kind, material, location, needDate, quantity }, actor);
    return {
      proposal: {
        id: proposal.id, run: run.code, material, location, kind, needDate, quantity,
        ...timing,
        // Only a requisition can be accepted, and it is exploded through no BOM, so it passed over none (E18-S03).
        executable: true, document: document.id, bom: null, bomRevision: null, rejectedBoms: [],
      },
      document,
    };
  }
}
