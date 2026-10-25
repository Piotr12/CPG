import { documentState, outstandingQuantity, resolveLines as resolveLifecycle, type DocumentState, type LifecycleAction } from "../../domain/document-lifecycle/lifecycle";
import { randomUUID } from "node:crypto";
import {
  OptimisticLockError,
  StockMovement,
  Transfer,
  TransferPosting,
  TransferReversal,
  UniqueConstraintViolationException,
  type EntityManager,
  type FilterQuery,
  type Material,
  type OrderDefinition,
  type TransferPostingKind,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { listOrderBy, searchWhere, type SortField } from "../../domain/lists/list-query";
import { afterPosting, afterReversal, inTransitOf, isFullyReceived, postingLimit, undispatchedOf } from "../../domain/transfers/transfer-quantity";
import { parseDecimal } from "../../domain/quantities/decimal";
import { ConflictError, NotFoundError, ValidationError, versionConflict } from "../../http/errors";
import {
  TRANSFER_PAGE_SIZE,
  transferPostingIdSchema,
  type TransferCreateInput,
  type TransferDates,
  type TransferPostingInput,
  type TransferWriteOffInput,
} from "../../validators/transfers/transfer.schema";
import { parseInput } from "../../http/parse-input";
import type { ListOptions } from "../../validators/lists/list-query.schema";
import type { TransferSort } from "../../validators/transfers/transfer-list.schema";
import { stockReversalSchema } from "../../validators/stock/stock-reversal.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { lineError } from "../materials/line-error";
import { assertReversalSource, inconsistentReversal, linkReversals } from "../stock/reversal-records";
import { postHistoricalInverses, postStockMovements, REVERSAL_MOVEMENT } from "../stock/stock-posting";
import { isScopeReadOnly } from "../tenants/tenant.service";

export type { TransferPostingKind };

/** The stock movement types a transfer posts (INV-012: every movement names its source). */
export const TRANSFER_DISPATCH_MOVEMENT = "transfer-dispatch";
export const TRANSFER_RECEIPT_MOVEMENT = "transfer-receipt";
/** What the Transfers search matches, and the column each sort key orders by (#217). */
const TRANSFER_SEARCH_FIELDS = ["code", "material.code", "material.description", "source.code", "source.name", "destination.code", "destination.name"];
const TRANSFER_SORT_PATHS: Record<TransferSort, SortField> = {
  id: "code",
  material: "material.code",
  source: "source.code",
  quantity: { decimal: "quantity" },
  dispatched: { decimal: "dispatched" },
  received: { decimal: "received" },
  plannedDispatch: "plannedDispatch",
  status: "status",
};

export const TRANSFER_ID_RACE = "Another transfer was created at the same moment. Try again.";

/** The most postings a transfer's page and `GET …/transfers/{id}` show, newest first, as the stock ledger does. */
export const TRANSFER_POSTINGS_SHOWN = 100;

/** A transfer as the screens and the API show it. `id` is its eight-digit business ID; quantities are base-unit, six decimals. */
export interface TransferView {
  id: string;
  material: string;
  source: string;
  destination: string;
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
  plannedDispatch: string;
  plannedArrival: string;
  dispatched: string;
  received: string;
  writtenOff: string;
  /** Dispatched, and neither received nor written off: it belongs to the transfer, not a location (INV-009). */
  inTransit: string;
  /** Still to dispatch. */
  undispatched: string;
  status: DocumentState;
  abandoned: string;
  outstanding: string;
  createdAt: Date;
  updatedAt: Date;
  /** The optimistic-lock version a date edit must carry back (AUD-024, API-029). */
  version: number;
}

/**
 * One leg of a posting in the ledger (TRF-024): the source or the destination location, whose
 * physical stock moved, or the transfer's transit. `quantity` is signed; `before`/`after` are the
 * location's physical balance, or the transfer's in-transit quantity, around it.
 */
export interface TransferLegView {
  place: "source" | "transit" | "destination";
  location: string | null;
  quantity: string;
  before: string;
  after: string;
}

/** A dispatch, receipt or write-off with its legs: a dispatch −q at the source and +q in transit, a receipt −q in transit and +q at the destination, a write-off −q in transit. */
export interface TransferPostingView {
  id: string;
  kind: TransferPostingKind;
  businessDate: string;
  occurredAt: Date;
  quantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
  reason: string;
  actorUsername: string;
  channel: "ui" | "api";
  legs: TransferLegView[];
  /** The reversal that undid it, or null (E11-S03). */
  reversedBy: string | null;
  /** Whether it may be reversed now: not yet reversed, and a dispatch only once nothing received or written off remains (spec Q2). */
  canReverse: boolean;
}

/**
 * The full reversal of one posting (E11-S03): `original` is the posting's ID and `kind` its kind. Its
 * legs mirror the original's with opposite signs, in the order the goods move back.
 */
export interface TransferReversalView {
  id: string;
  original: string;
  kind: TransferPostingKind;
  businessDate: string;
  occurredAt: Date;
  quantity: string;
  reason: string;
  actorUsername: string;
  channel: "ui" | "api";
  legs: TransferLegView[];
}

/** A transfer with its newest postings (at most `TRANSFER_POSTINGS_SHOWN`) and the reversals of those postings. */
export interface TransferDetailView extends TransferView {
  postings: TransferPostingView[];
  reversals: TransferReversalView[];
}

/** What a reversal returns: the transfer after it, and the reversal. */
export interface TransferReversalResult {
  transfer: TransferView;
  reversal: TransferReversalView;
}

/** What a posting returns: the transfer after it, and the posting. */
export interface PostedTransferView {
  transfer: TransferView;
  posting: TransferPostingView;
}

/** How each posting kind is refused when it moves more than it may (spec Q4–Q6), and what it names. */
const OVER_LIMIT: Record<TransferPostingKind, { code: string; what: string }> = {
  dispatch: { code: "TRANSFER_OVER_DISPATCH", what: "is left to dispatch" },
  receipt: { code: "TRANSFER_OVER_RECEIPT", what: "is in transit" },
  "write-off": { code: "TRANSFER_OVER_WRITE_OFF", what: "is in transit" },
};

/** The audit action each posting kind records. */
const POSTED_ACTION: Record<TransferPostingKind, string> = { dispatch: "dispatched", receipt: "received", "write-off": "written-off" };

interface Deps {
  em: EntityManager;
}

/**
 * The tenant's transfers (E07-S03): one material moving from a source location to a different
 * destination. Resolved from a tenant scope, so every read and write is that tenant's only (R05,
 * TRF-022); any signed-in account writes. A new transfer is Open and changes no stock (TRF-003,
 * LFC-001); only its planned dates change afterwards. A **dispatch** takes stock off the source into
 * transit, a **receipt** takes it out of transit onto the destination, a **write-off** takes a lost
 * quantity out of transit: each is one transaction with both of its legs, the transfer's progress
 * and the audit (AUD-019, AUD-020, R08), dated today (INV-010). In-transit stock belongs to the
 * transfer, never to a location, so neither site can use it (TRF-010, TRF-011). The transfer
 * completes once its planned quantity is received (spec Q7).
 */
export class TransferService {
  private readonly em: EntityManager;

  constructor({ em }: Deps) {
    this.em = em;
  }

  /**
   * One page of the tenant's transfers, by ID unless `sort` says otherwise (`TRANSFER_PAGE_SIZE`
   * each); `q` keeps those whose ID, material or either location holds every word (#217).
   */
  async list({ page = 1, q = "", sort = "id", dir = "asc" }: ListOptions<TransferSort> = {}): Promise<TransferView[]> {
    const transfers = await this.em.find(Transfer, transferSearch(q), {
      populate: ["material", "source", "destination"],
      orderBy: listOrderBy(TRANSFER_SORT_PATHS[sort], dir) as OrderDefinition<Transfer>,
      limit: TRANSFER_PAGE_SIZE,
      offset: (page - 1) * TRANSFER_PAGE_SIZE,
    });
    return transfers.map(toView);
  }

  /** How many transfers the tenant has that `q` keeps, for the pages of `list`. */
  async count({ q = "" }: { q?: string } = {}): Promise<number> {
    return this.em.count(Transfer, transferSearch(q));
  }

  /** One transfer with its newest postings; `TRANSFER_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<TransferDetailView> {
    const transfer = await findTransfer(this.em, id);
    const postings = await this.em.find(TransferPosting, { transfer }, { orderBy: { occurredAt: "desc", id: "desc" }, limit: TRANSFER_POSTINGS_SHOWN });
    const reversals = postings.length === 0 ? [] : await this.em.find(TransferReversal, { original: { $in: postings } }, { orderBy: { occurredAt: "desc", id: "desc" } });
    return { ...toView(transfer), postings: await postingViews(this.em, transfer, postings, reversals), reversals: await reversalViews(this.em, reversals) };
  }

  /** A new Open transfer with the next ID and nothing moved (TRF-001, TRF-003, LFC-001). The caller has parsed `input` with `transferCreateSchema`. */
  async create(input: TransferCreateInput, actor: AuditActor): Promise<TransferView> {
    try {
      return await this.em.transactional(async (em) => {
        const material = await findActiveMaterial(em, input.material);
        const source = await findActiveLocation(em, input.source);
        const destination = await findActiveLocation(em, input.destination);
        const record = await convertEntered(em, material, input);
        const [highest] = await em.find(Transfer, {}, { orderBy: { code: "desc" }, limit: 1 });
        const code = nextSequentialId(highest?.code ?? null, { code: "TRANSFER_IDS_EXHAUSTED", message: "This tenant has used every eight-digit transfer ID." });
        const { baseQuantity, enteredQuantity, enteredUnit, numerator, denominator } = record;
        const transfer = em.create(Transfer, {
          code, material, source, destination, quantity: baseQuantity, enteredQuantity, enteredUnit, numerator, denominator,
          plannedDispatch: input.plannedDispatch, plannedArrival: input.plannedArrival,
          dispatched: "0.000000", received: "0.000000", writtenOff: "0.000000", status: "open",
        });
        recordTenantAudit(em, actor, entry("created", transfer, null, {
          id: code, material: material.code, source: source.code, destination: destination.code, quantity: baseQuantity, unit: material.baseUnit,
          plannedDispatch: transfer.plannedDispatch, plannedArrival: transfer.plannedArrival, status: "open",
        }));
        await em.flush();
        return toView(transfer);
      });
    } catch (error) {
      // A racing create normally surfaces as a stale snapshot, which the request wrappers retry;
      // the unique index only catches what slips past that.
      if (error instanceof UniqueConstraintViolationException) throw new ConflictError(TRANSFER_ID_RACE, "TRANSFER_ID_RACE");
      throw error;
    }
  }

  /** New planned dates at `version` (spec Q3, TRF-026); the same dates are no change and record nothing. A Completed transfer refuses. */
  async setPlannedDates(id: string, dates: TransferDates, version: number, actor: AuditActor): Promise<TransferView> {
    return this.versioned(async (em) => {
      const transfer = await findTransfer(em, id, { refresh: true });
      // A Completed transfer is said as such before any version check: a conflict would refresh the page and hide its dialog.
      assertOpen(transfer);
      if (transfer.version !== version) throw versionConflict();
      const { plannedDispatch, plannedArrival } = transfer;
      if (plannedDispatch === dates.plannedDispatch && plannedArrival === dates.plannedArrival) return toView(transfer);
      Object.assign(transfer, dates, { updatedAt: new Date() });
      recordTenantAudit(em, actor, entry("updated", transfer, { plannedDispatch, plannedArrival }, { ...dates }));
      await em.flush();
      return toView(transfer);
    });
  }

  /** Sends part or all of what is left from the source into transit (TRF-004, TRF-005, TRF-009); never more than the source holds (TRF-008, R09). */
  dispatch(id: string, input: TransferPostingInput, actor: AuditActor): Promise<PostedTransferView> {
    return this.post(id, "dispatch", input, actor);
  }

  /** Lands part or all of what is in transit at the destination (TRF-006); never more than is in transit (TRF-007). */
  receive(id: string, input: TransferPostingInput, actor: AuditActor): Promise<PostedTransferView> {
    return this.post(id, "receipt", input, actor);
  }

  /** Writes off a lost part of what is in transit, with its reason (TRF-013); no location changes. */
  writeOff(id: string, input: TransferWriteOffInput, actor: AuditActor): Promise<PostedTransferView> {
    return this.post(id, "write-off", input, actor);
  }

  cancel(id: string, version: number, actor: AuditActor): Promise<TransferView> {
    return this.resolve(id, version, actor, "cancel");
  }

  closeEarly(id: string, version: number, actor: AuditActor): Promise<TransferView> {
    return this.resolve(id, version, actor, "close-early");
  }

  private async resolve(id: string, version: number, actor: AuditActor, action: LifecycleAction): Promise<TransferView> {
    return this.versioned(async (em) => {
      const transfer = await findTransfer(em, id, { refresh: true });
      if (transfer.version !== version) throw versionConflict();
      assertOpen(transfer);
      const inTransit = inTransitOf(transfer);
      if (action === "close-early" && inTransit !== "0.000000") {
        throw new ConflictError(`Receive or write off the ${inTransit} ${transfer.material.baseUnit} still in transit first.`, "TRANSFER_IN_TRANSIT",
          { quantity: inTransit, unit: transfer.material.baseUnit });
      }
      const before = { ...progressSnapshot(transfer), abandoned: transfer.abandoned };
      const [resolved] = resolveLifecycle(action, [{ quantity: transfer.quantity, processed: transfer.received,
        // Immutable history counts as processing, even once every posting is reversed (spec Q8).
        abandoned: transfer.abandoned, status: transfer.status as DocumentState }], { hasProcessing: (await em.count(TransferPosting, { transfer })) > 0 });
      transfer.abandoned = resolved.abandoned;
      transfer.status = documentState([resolved.status]);
      transfer.updatedAt = new Date(Math.max(Date.now(), transfer.updatedAt.getTime() + 1));
      recordTenantAudit(em, actor, entry(action === "cancel" ? "cancelled" : "closed-early", transfer, before,
        { ...progressSnapshot(transfer), abandoned: transfer.abandoned }));
      await em.flush();
      return toView(transfer);
    });
  }

  /**
   * One posting of `kind` in one transaction: the transfer is read fresh, the quantity converted and
   * checked against the kind's limit, then the physical leg is posted through the ledger's primitive
   * (which refuses an overdraw of the source), the transit leg and the transfer's progress written,
   * and everything audited. Any refusal writes nothing (AUD-019, AUD-020).
   */
  private async post(id: string, kind: TransferPostingKind, input: TransferPostingInput & { reason?: string }, actor: AuditActor): Promise<PostedTransferView> {
    return this.versioned(async (em) => {
      const transfer = await findTransfer(em, id, { refresh: true });
      assertOpen(transfer);
      const { material, source, destination } = transfer;
      const record = await convertEntered(em, material, input);
      const outcome = afterPosting(transfer, kind, record.baseQuantity);
      if (!outcome) {
        const limit = postingLimit(transfer, kind);
        const { code, what } = OVER_LIMIT[kind];
        throw new ConflictError(`Transfer ${transfer.code}: only ${limit} ${material.baseUnit} ${what}.`, code, {
          transfer: transfer.code, available: limit, requested: record.baseQuantity, unit: material.baseUnit,
        });
      }
      const postingId = randomUUID();
      const reason = input.reason ?? postingReason(transfer, kind);
      let businessDate = new Date().toISOString().slice(0, 10);
      if (kind !== "write-off") {
        const location = kind === "dispatch" ? source : destination;
        const sign = kind === "dispatch" ? "-" : "";
        const [movement] = await postStockMovements(
          em,
          { lines: [{ material: material.code, location: location.code, quantity: `${sign}${record.enteredQuantity}`, unit: record.enteredUnit }], reason },
          { type: kind === "dispatch" ? TRANSFER_DISPATCH_MOVEMENT : TRANSFER_RECEIPT_MOVEMENT, id: postingId },
          { kind: "user", actor },
        );
        businessDate = movement.businessDate;
      }
      const before = progressSnapshot(transfer);
      const posting = em.create(TransferPosting, {
        id: postingId, transfer, kind, businessDate, quantity: record.baseQuantity, enteredQuantity: record.enteredQuantity,
        enteredUnit: record.enteredUnit, numerator: record.numerator, denominator: record.denominator,
        transitBefore: outcome.transitBefore, transitAfter: outcome.transitAfter, reason,
        actorUserId: actor.userId, actorUsername: actor.username, channel: actor.channel,
      });
      Object.assign(transfer, outcome.progress, { updatedAt: new Date() });
      transfer.status = documentState([isFullyReceived(transfer) ? "completed" : "open"]);
      recordTenantAudit(em, actor, entry(POSTED_ACTION[kind], transfer, before, {
        // `posting` is what this posting's reversal records as `posting`, so the two entries match (#145).
        ...progressSnapshot(transfer), moved: record.baseQuantity, businessDate, posting: postingId, ...(kind === "write-off" ? { reason } : {}),
      }));
      await em.flush();
      const [view] = await postingViews(em, transfer, [posting], []);
      return { transfer: toView(transfer), posting: view };
    });
  }

  /**
   * Reverses posting `postingId` of transfer `id` in full, once, today (E11-S03): its physical leg (if
   * any) as an exact historical inverse, linked to the original movement, and its transit leg as a
   * `TransferReversal`, with the transfer's progress and audit, in one transaction. A dispatch waits
   * until every receipt and write-off is reversed (TRF-020, spec Q2); a reversed receipt needs the
   * destination to still hold it (TRF-019). The transfer is Open again afterwards, a Closed Early one
   * included, with nothing abandoned (TRF-027, spec Q5); its masters must all be active (spec Q7).
   */
  async reverse(id: string, postingId: string, raw: unknown, actor: AuditActor): Promise<TransferReversalResult> {
    const original = parseInput(transferPostingIdSchema, postingId);
    const { reason } = parseInput(stockReversalSchema, raw);
    try {
      return await this.versioned(async (em) => {
        if (await isScopeReadOnly(em)) throw new ConflictError("This tenant is read-only.", "TENANT_READ_ONLY");
        const transfer = await findTransfer(em, id, { refresh: true });
        const posting = await em.findOne(TransferPosting, { transfer, id: original });
        if (!posting) throw new NotFoundError("TRANSFER_POSTING_NOT_FOUND", `Transfer ${transfer.code} has no posting ${original}.`);
        const existing = await em.findOne(TransferReversal, { original: posting });
        if (existing) throw postingAlreadyReversed(existing.id);
        assertActiveMasters(transfer);
        if (posting.kind === "dispatch" && !hasNothingDownstream(transfer)) {
          throw new ConflictError(`Transfer ${transfer.code}: reverse its receipts and write-offs before a dispatch.`, "TRANSFER_REVERSAL_ORDER",
            { transfer: transfer.code, received: transfer.received, writtenOff: transfer.writtenOff, unit: transfer.material.baseUnit });
        }
        const physical = await physicalLeg(em, transfer, posting);
        const outcome = afterReversal(transfer, posting.kind, posting.quantity);
        if (!outcome) throw inconsistentReversal();
        const reversalId = randomUUID();
        let businessDate = new Date().toISOString().slice(0, 10);
        if (physical) {
          const inverses = await postHistoricalInverses(em, [physical], reason, reversalId, actor);
          await linkReversals(em, [physical], inverses);
          businessDate = inverses[0].businessDate;
        }
        const before = { ...progressSnapshot(transfer), abandoned: transfer.abandoned };
        const reversal = em.create(TransferReversal, {
          id: reversalId, transfer, original: posting, businessDate, quantity: posting.quantity,
          transitBefore: outcome.transitBefore, transitAfter: outcome.transitAfter, reason,
          actorUserId: actor.userId, actorUsername: actor.username, channel: actor.channel,
        });
        // A transfer can't stay closed with stock in transit, nor Completed once less is received (spec Q5).
        Object.assign(transfer, outcome.progress, { abandoned: "0.000000", status: "open", updatedAt: new Date(Math.max(Date.now(), transfer.updatedAt.getTime() + 1)) });
        recordTenantAudit(em, actor, entry("reversed", transfer, before, {
          ...progressSnapshot(transfer), abandoned: transfer.abandoned, posting: posting.id, kind: posting.kind,
          reversal: reversalId, quantity: posting.quantity, businessDate, reason,
        }));
        await em.flush();
        const [view] = await reversalViews(em, [reversal]);
        return { transfer: toView(transfer), reversal: view };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        // A racing reversal won past the in-transaction check: name the one that exists, read afresh.
        const existing = await this.em.findOne(TransferReversal, { original }, { refresh: true });
        throw postingAlreadyReversed(existing?.id ?? null);
      }
      throw error;
    }
  }

  /** Runs a change in one transaction; a stale version, the caller's or one a racing write advanced, is `VERSION_CONFLICT`. */
  private async versioned<T>(change: (em: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.em.transactional(change);
    } catch (error) {
      if (error instanceof OptimisticLockError) throw versionConflict();
      throw error;
    }
  }
}

/** The transfer with business ID `id` in `em`'s tenant, with its material and locations, or `TRANSFER_NOT_FOUND` (TEN-014). */
async function findTransfer(em: EntityManager, id: string, options: { refresh?: boolean } = {}): Promise<Transfer> {
  const transfer = await em.findOne(Transfer, { code: id }, { ...options, populate: ["material", "source", "destination"] });
  if (!transfer) throw new NotFoundError("TRANSFER_NOT_FOUND", `There is no transfer ${id} in this tenant.`);
  return transfer;
}

function postingAlreadyReversed(reversal: string | null): ConflictError {
  return new ConflictError("This posting has already been reversed.", "TRANSFER_POSTING_ALREADY_REVERSED", reversal === null ? undefined : { reversal });
}

/** Nothing received or written off remains: only then may a dispatch be reversed (spec Q2). */
function hasNothingDownstream({ received, writtenOff }: Transfer): boolean {
  return parseDecimal(received) === 0n && parseDecimal(writtenOff) === 0n;
}

/** Refuses a reversal that would leave an Open transfer on an inactive material or location (spec Q7). */
function assertActiveMasters({ code, material, source, destination }: Transfer): void {
  const inactive = Object.entries({ material, source, destination }).filter(([, record]) => !record.active);
  if (inactive.length > 0) {
    throw new ConflictError(`Transfer ${code} uses an inactive material or location. Reactivate it before reversing.`, "TRANSFER_MASTER_INACTIVE",
      { transfer: code, ...Object.fromEntries(inactive.map(([role, record]) => [role, record.code])) });
  }
}

/**
 * The posting's physical stock movement, checked against the posting before anything is inverted: a
 * dispatch's −q at the source, a receipt's +q at the destination; a write-off has none. Anything else is
 * `STOCK_REVERSAL_INCONSISTENT`.
 */
async function physicalLeg(em: EntityManager, transfer: Transfer, posting: TransferPosting): Promise<StockMovement | null> {
  const movements = await em.find(StockMovement, { postingId: posting.id }, { populate: ["material", "location"], refresh: true });
  if (posting.kind === "write-off") {
    if (movements.length > 0) throw inconsistentReversal();
    return null;
  }
  const [movement] = movements;
  const type = posting.kind === "dispatch" ? TRANSFER_DISPATCH_MOVEMENT : TRANSFER_RECEIPT_MOVEMENT;
  if (movements.length !== 1 || movement.type !== type) throw inconsistentReversal();
  const location = posting.kind === "dispatch" ? transfer.source : transfer.destination;
  assertReversalSource(movement, transfer.material.id, location.id, posting.quantity, posting.kind === "dispatch" ? -1n : 1n);
  return movement;
}

/** Refuses a change to a transfer that is no longer Open: a Completed one takes no posting and no edit (spec Q7). */
function assertOpen(transfer: Transfer): void {
  if (transfer.status !== "open") {
    throw new ConflictError(`Transfer ${transfer.code} is ${transfer.status}, so it can't change.`, "TRANSFER_NOT_OPEN");
  }
}

/** The entered quantity in the material's base unit; a refused conversion is a field error on `quantity` or `unit`. */
async function convertEntered(em: EntityManager, material: Material, { quantity, unit }: { quantity: string; unit: string }): Promise<BaseQuantity> {
  try {
    return await convertToBaseQuantity(em, material, { quantity, unit });
  } catch (error) {
    const [field, message] = lineError(error);
    throw new ValidationError({ [field]: [message] });
  }
}

/** The ledger reason of a dispatch or a receipt, naming the transfer and both locations (TRF-024). */
function postingReason({ code, source, destination }: Transfer, kind: TransferPostingKind): string {
  return kind === "dispatch"
    ? `Transfer ${code} dispatch from ${source.code} to ${destination.code}`
    : `Transfer ${code} receipt at ${destination.code} from ${source.code}`;
}

function toView(transfer: Transfer): TransferView {
  const { code, material, source, destination, quantity, enteredQuantity, enteredUnit, numerator, denominator,
    plannedDispatch, plannedArrival, dispatched, received, writtenOff, abandoned, status, createdAt, updatedAt, version } = transfer;
  return {
    id: code, material: material.code, source: source.code, destination: destination.code, quantity, enteredQuantity, enteredUnit,
    numerator, denominator, plannedDispatch, plannedArrival, dispatched, received, writtenOff,
    abandoned, outstanding: outstandingQuantity(quantity, received, abandoned),
    inTransit: inTransitOf(transfer), undispatched: status === "open" ? undispatchedOf(transfer) : "0.000000",
    status: status as TransferView["status"], createdAt, updatedAt, version,
  };
}

/**
 * The postings with their legs, in the order given; the physical legs are the stock movements posted
 * under each posting's ID. `reversals` holds the reversals of these postings that exist.
 */
async function postingViews(em: EntityManager, transfer: Transfer, postings: readonly TransferPosting[], reversals: readonly TransferReversal[]): Promise<TransferPostingView[]> {
  if (postings.length === 0) return [];
  const reversedBy = new Map(reversals.map((reversal) => [reversal.original.id, reversal.id]));
  const movements = await em.find(StockMovement, { postingId: { $in: postings.map(({ id }) => id) } }, { populate: ["location"] });
  return postings.map((posting) => {
    const transit: TransferLegView = {
      place: "transit",
      location: null,
      quantity: `${posting.kind === "dispatch" ? "" : "-"}${posting.quantity}`,
      before: posting.transitBefore,
      after: posting.transitAfter,
    };
    const movement = movements.find(({ postingId }) => postingId === posting.id);
    const physical: TransferLegView[] = movement
      ? [{
        place: posting.kind === "dispatch" ? "source" : "destination",
        location: movement.location.code,
        quantity: movement.quantity,
        before: movement.balanceBefore,
        after: movement.balanceAfter,
      }]
      : [];
    const { id, kind, businessDate, occurredAt, quantity, enteredQuantity, enteredUnit, numerator, denominator, reason, actorUsername, channel } = posting;
    return {
      id, kind, businessDate, occurredAt, quantity, enteredQuantity, enteredUnit, numerator, denominator, reason, actorUsername,
      channel: channel as TransferPostingView["channel"],
      // Each leg in the order the goods move: off the source into transit, out of transit onto the destination.
      legs: kind === "dispatch" ? [...physical, transit] : [transit, ...physical],
      reversedBy: reversedBy.get(id) ?? null,
      canReverse: !reversedBy.has(id) && (kind !== "dispatch" || hasNothingDownstream(transfer)),
    };
  });
}

/**
 * The reversals with their legs, in the order given: the transit leg is the reversal itself, the
 * physical leg the `reversal` movement posted under its ID. Each leg runs the opposite way to its
 * original's, in the order the goods move back.
 */
async function reversalViews(em: EntityManager, reversals: readonly TransferReversal[]): Promise<TransferReversalView[]> {
  if (reversals.length === 0) return [];
  const movements = await em.find(StockMovement, { type: REVERSAL_MOVEMENT, postingId: { $in: reversals.map(({ id }) => id) } }, { populate: ["location"] });
  const originals = await em.find(TransferPosting, { id: { $in: reversals.map(({ original }) => original.id) } });
  const kinds = new Map(originals.map(({ id, kind }) => [id, kind]));
  return reversals.map((reversal) => {
    const kind = kinds.get(reversal.original.id)!;
    const transit: TransferLegView = {
      place: "transit",
      location: null,
      quantity: `${kind === "dispatch" ? "-" : ""}${reversal.quantity}`,
      before: reversal.transitBefore,
      after: reversal.transitAfter,
    };
    const movement = movements.find(({ postingId }) => postingId === reversal.id);
    const physical: TransferLegView[] = movement
      ? [{ place: kind === "dispatch" ? "source" : "destination", location: movement.location.code, quantity: movement.quantity, before: movement.balanceBefore, after: movement.balanceAfter }]
      : [];
    const { id, businessDate, occurredAt, quantity, reason, actorUsername, channel } = reversal;
    return {
      id, original: reversal.original.id, kind, businessDate, occurredAt, quantity, reason, actorUsername,
      channel: channel as TransferReversalView["channel"],
      legs: kind === "dispatch" ? [transit, ...physical] : [...physical, transit],
    };
  });
}

/** A transfer's progress as the audit may show it (R08). */
function progressSnapshot(transfer: Transfer) {
  const { dispatched, received, writtenOff, status } = transfer;
  return { dispatched, received, writtenOff, inTransit: inTransitOf(transfer), status };
}

function entry(action: string, transfer: Transfer, before: AuditEntry["before"], after: AuditEntry["after"]): AuditEntry {
  const { code, material, source, destination } = transfer;
  return {
    action: `transfers.transfer.${action}`,
    subject: { type: "Transfer", id: code, label: `${code} — ${material.code} ${material.description}: ${source.code} → ${destination.code}` },
    before,
    after,
  };
}

/** The transfers a list search keeps: `list` and `count` share it, so the pages add up. */
function transferSearch(q: string): FilterQuery<Transfer> {
  return searchWhere(q, TRANSFER_SEARCH_FIELDS) as FilterQuery<Transfer>;
}
