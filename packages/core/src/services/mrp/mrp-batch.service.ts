import { MrpRecommendation, type EntityManager, type MrpRun, type MrpRunCreation } from "@cpg/db";
import { EXECUTABLE_PROPOSAL_KINDS, isExecutableProposal } from "../../domain/mrp/acceptance/executable-proposal";
import { AppError, ValidationError } from "../../http/errors";
import { inRequestSavepoint } from "../../http/request-transaction";
import { yieldToEventLoop } from "../../http/yield-to-event-loop";
import type { AuditActor } from "../audit/actor";
import type { MrpProposalFields, MrpProposalDocumentService } from "./mrp-proposal-document.service";
import type { MrpCreatedDocumentView } from "./mrp-run-view";

/**
 * The most proposals one automatic batch may create (E19-S03, spec Q15). The batch holds the write lock from
 * start to commit, so every other writer, the other container during a deploy included, waits for it; above
 * this a run records `MRP_BATCH_TOO_LARGE` and creates nothing. The benchmark at the cap keeps it in budget.
 */
export const MRP_BATCH_LIMIT = 2_500;

/** Documents per flush: every flush walks the identity map, so it is cleared after each chunk (lesson 2026-10-22). The batch yields after every document. */
export const MRP_BATCH_CHUNK = 25;

/**
 * Transient ID races a held write lock rules out, which must never be stored as a permanent outcome (spec Q10):
 * the requisition's and, since Make joined the batch (#320), the production order's.
 */
const ID_RACES: ReadonlySet<string> = new Set(["REQUISITION_ID_RACE", "PRODUCTION_ORDER_ID_RACE"]);

export const MRP_BATCH_TOO_LARGE =
  "This automatic run has more proposals than one batch may create. Nothing was created; accept proposals one at a time, or ask for the limit to be raised.";

/** What a batch did: the run's stored outcome, and the documents it created, in candidate order. */
export interface MrpBatchOutcome {
  creation: MrpRunCreation;
  documents: MrpCreatedDocumentView[];
}

interface Deps {
  em: EntityManager;
  mrpProposalDocumentService: MrpProposalDocumentService;
  mrpBatchLimit: number;
}

/**
 * The automatic batch of an MRP run (E19-S03, PRD §04 "Manual/auto creation"): every executable proposal of the
 * run becomes its document, tagged with the run, or none does. It runs in the run's own request transaction, with
 * the write gate and SQLite's write lock already held since before the run read anything (spec Q3), so nothing it
 * creates can be planned from data that changed under it; late validation is each document service's own checks.
 */
export class MrpBatchService {
  private readonly em: EntityManager;
  private readonly mrpProposalDocumentService: MrpProposalDocumentService;
  private readonly limit: number;

  constructor({ em, mrpProposalDocumentService, mrpBatchLimit }: Deps) {
    this.em = em;
    this.mrpProposalDocumentService = mrpProposalDocumentService;
    this.limit = mrpBatchLimit;
  }

  /**
   * Creates every executable proposal of `run`, in its stored order (material, location, need date: spec Q14),
   * inside a savepoint. The first business refusal (an `AppError`) rolls the savepoint back, taking every
   * document, its audit entry and every proposal mark of the batch with it (AUD-023), and is returned as the
   * failed outcome with its candidate. `REQUISITION_ID_RACE` and any other error propagate (spec Q10): they
   * aren't outcomes to store under an idempotency key; so does `PRODUCTION_ORDER_ID_RACE` (#320). Must run inside `inRequestTransaction`; it clears the
   * identity map, so the caller re-loads what it holds.
   */
  async createAll(run: MrpRun, actor: AuditActor): Promise<MrpBatchOutcome> {
    // The predicate filters in code below: in a run this image writes every candidate passes it (#320 Q9).
    const where = { run, kind: { $in: [...EXECUTABLE_PROPOSAL_KINDS] } };
    const candidates = await this.em.count(MrpRecommendation, where);
    if (candidates > this.limit) {
      const params = { candidates: String(candidates), limit: String(this.limit) };
      return { creation: { status: "failed", code: "MRP_BATCH_TOO_LARGE", message: MRP_BATCH_TOO_LARGE, params }, documents: [] };
    }
    // Plain values, bounded by the cap: no managed recommendation outlives a clear (lesson 2026-10-22).
    const rows = await this.em.find(MrpRecommendation, where, {
      orderBy: { material: "asc", location: "asc", needDate: "asc" },
      fields: ["id", "kind", "material", "location", "needDate", "quantity", "bom", "bomRevision"],
      disableIdentityMap: true,
    });
    const proposals: MrpProposalFields[] = rows
      .map(({ id, kind, material, location, needDate, quantity, bom, bomRevision }) => ({
        id, kind, material, location, needDate, quantity, bom: bom ?? null, bomRevision: bomRevision ?? null,
      }))
      .filter(isExecutableProposal);
    const runCode = run.code;
    const documents: MrpCreatedDocumentView[] = [];
    let current: MrpProposalFields | undefined;
    try {
      await inRequestSavepoint(
        this.em,
        async () => {
          for (const [index, proposal] of proposals.entries()) {
            current = proposal;
            const document = await this.mrpProposalDocumentService.create(runCode, proposal, actor);
            documents.push({ proposal: proposal.id, kind: proposal.kind, id: document.id });
            if ((index + 1) % MRP_BATCH_CHUNK === 0) {
              await this.em.flush();
              this.em.clear();
            }
            // After every document, not every chunk: a production order reads its BOMs, components and balances,
            // so a chunk of 25 kept the server from reading its sockets for too long (#320 Q10, lesson 2026-10-24).
            await yieldToEventLoop();
          }
        },
        { keep: true },
      );
    } catch (error) {
      if (!(error instanceof AppError) || ID_RACES.has(error.code)) throw error;
      return { creation: failure(error, current!), documents: [] };
    }
    return { creation: { status: "created", documents: documents.length }, documents };
  }
}

/** A refusal as the run stores it: its code and fixed message, its params and field errors when it has them, and the candidate. */
function failure(error: AppError, { id, kind, material, location, needDate, quantity }: MrpProposalFields): MrpRunCreation {
  return {
    status: "failed",
    code: error.code,
    message: error.message,
    ...(error.messageParams && { params: error.messageParams }),
    ...(error instanceof ValidationError && { fieldErrors: error.fieldErrors }),
    candidate: { proposal: id, kind, material, location, needDate, quantity },
  };
}
