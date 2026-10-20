import { randomUUID } from "node:crypto";
import {
  OptimisticLockError,
  StockMovement,
  Transfer,
  TransferPosting,
  UniqueConstraintViolationException,
  type EntityManager,
  type Material,
  type TransferPostingKind,
} from "@cpg/db";
import { nextSequentialId } from "../../domain/business-ids/sequential-id";
import { afterPosting, inTransitOf, isFullyReceived, postingLimit, undispatchedOf } from "../../domain/transfers/transfer-quantity";
import { ConflictError, NotFoundError, ValidationError, versionConflict } from "../../http/errors";
import {
  TRANSFER_PAGE_SIZE,
  type TransferCreateInput,
  type TransferDates,
  type TransferPostingInput,
  type TransferWriteOffInput,
} from "../../validators/transfers/transfer.schema";
import type { AuditActor } from "../audit/actor";
import { recordTenantAudit, type AuditEntry } from "../audit/audit-recorder";
import { findActiveLocation } from "../locations/find-location";
import { convertToBaseQuantity, type BaseQuantity } from "../materials/base-quantity";
import { findActiveMaterial } from "../materials/find-material";
import { lineError } from "../materials/line-error";
import { postStockMovements } from "../stock/stock-posting";

export type { TransferPostingKind };

/** The stock movement types a transfer posts (INV-012: every movement names its source). */
export const TRANSFER_DISPATCH_MOVEMENT = "transfer-dispatch";
export const TRANSFER_RECEIPT_MOVEMENT = "transfer-receipt";
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
  status: "open" | "completed";
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
}

/** A transfer with its newest postings (at most `TRANSFER_POSTINGS_SHOWN`). */
export interface TransferDetailView extends TransferView {
  postings: TransferPostingView[];
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

  /** One page of the tenant's transfers, by ID (`TRANSFER_PAGE_SIZE` each). */
  async list(page = 1): Promise<TransferView[]> {
    const transfers = await this.em.find(Transfer, {}, {
      populate: ["material", "source", "destination"],
      orderBy: { code: "asc" },
      limit: TRANSFER_PAGE_SIZE,
      offset: (page - 1) * TRANSFER_PAGE_SIZE,
    });
    return transfers.map(toView);
  }

  async count(): Promise<number> {
    return this.em.count(Transfer, {});
  }

  /** One transfer with its newest postings; `TRANSFER_NOT_FOUND` when this tenant has no such ID, another tenant's included (TEN-014). */
  async get(id: string): Promise<TransferDetailView> {
    const transfer = await findTransfer(this.em, id);
    const postings = await this.em.find(TransferPosting, { transfer }, { orderBy: { occurredAt: "desc", id: "desc" }, limit: TRANSFER_POSTINGS_SHOWN });
    return { ...toView(transfer), postings: await postingViews(this.em, transfer, postings) };
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
      if (transfer.version !== version) throw versionConflict();
      assertOpen(transfer);
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
      if (isFullyReceived(transfer)) transfer.status = "completed";
      recordTenantAudit(em, actor, entry(POSTED_ACTION[kind], transfer, before, {
        ...progressSnapshot(transfer), moved: record.baseQuantity, businessDate, ...(kind === "write-off" ? { reason } : {}),
      }));
      await em.flush();
      const [view] = await postingViews(em, transfer, [posting]);
      return { transfer: toView(transfer), posting: view };
    });
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
    plannedDispatch, plannedArrival, dispatched, received, writtenOff, status, createdAt, updatedAt, version } = transfer;
  return {
    id: code, material: material.code, source: source.code, destination: destination.code, quantity, enteredQuantity, enteredUnit,
    numerator, denominator, plannedDispatch, plannedArrival, dispatched, received, writtenOff,
    inTransit: inTransitOf(transfer), undispatched: undispatchedOf(transfer),
    status: status as TransferView["status"], createdAt, updatedAt, version,
  };
}

/** The postings with their legs, in the order given; the physical legs are the stock movements posted under each posting's ID. */
async function postingViews(em: EntityManager, transfer: Transfer, postings: readonly TransferPosting[]): Promise<TransferPostingView[]> {
  if (postings.length === 0) return [];
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
