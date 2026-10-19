import {
  GlobalIdempotencyKey,
  TenantIdempotencyKey,
  UniqueConstraintViolationException,
  type EntityManager,
  type TenantCode,
} from "@cpg/db";
import { assertCurrentGeneration } from "../../domain/tenants/generation";
import { assertWritable } from "../../domain/tenants/read-only";
import { ConflictError } from "../../http/errors";
import { inRequestTransaction, isStaleSnapshot } from "../../http/request-transaction";
import type { TenantService, TenantState } from "../tenants/tenant.service";
import { fingerprintMatches, type Fingerprint } from "./fingerprint";

/** How long a key keeps its result: R07's 24 hours, from the first successful use (API-026). */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** One keyed write, as the API wrapper describes it. */
export interface IdempotentWrite {
  /** The account the key belongs to (spec Q3): shared by its tokens, never by another account. */
  userId: string;
  key: string;
  /** `METHOD /path`. */
  operation: string;
  fingerprint: Fingerprint;
}

/** Where the key lives: the global store, or one tenant's, with the generation the client sent. */
export type IdempotencyScope =
  | { kind: "global" }
  | { kind: "tenant"; tenant: TenantCode; generation: number | null; requireGeneration: boolean };

/**
 * The result to answer with: from this write, or replayed from the first one. A replayed result is
 * the stored JSON, so its dates are already ISO strings — exactly what the first response carried.
 */
export interface IdempotentResult<T> {
  data: T;
  replayed: boolean;
}

interface Deps {
  em: EntityManager;
  tenantService: TenantService;
}

/** The parts of a stored key that decide what a repeat gets. */
interface StoredKey {
  operation: string;
  fingerprint: string;
  response: unknown;
}

type Attempt<T> = { kind: "written"; data: T } | { kind: "found"; stored: StoredKey };

/** Raised inside the transaction when another writer stored the same key first. */
class KeyTakenError extends Error {
  constructor() {
    super("idempotency key stored concurrently");
    this.name = "KeyTakenError";
  }
}

/**
 * Makes API writes safe to retry (R07). The key's record is inserted in the same transaction as the
 * write it guards, under a unique index, so a write and its key commit or roll back together (spec
 * Q6). Must run on the request scope's own `em`, with a `write` that uses services from that scope.
 */
export class IdempotencyService {
  private readonly em: EntityManager;
  private readonly tenantService: TenantService;

  constructor({ em, tenantService }: Deps) {
    this.em = em;
    this.tenantService = tenantService;
  }

  /**
   * Runs `write` once per key. A repeat with the same fingerprint within 24 hours gets the first
   * result and writes nothing; a different request with the key is `IDEMPOTENCY_KEY_REUSED`. A
   * failed write stores nothing, so its retry runs again. For a tenant, the generation is checked
   * first, inside the transaction: a stale one is refused before any lookup (API-033, TEN-030). A
   * read-only tenant refuses the write after the lookup (R05, API-030): a repeat of a write stored
   * before the flag was set still gets its result, because replaying it changes nothing.
   */
  async run<T>(request: IdempotentWrite, scope: IdempotencyScope, write: () => Promise<T>): Promise<IdempotentResult<T>> {
    const attempt = await this.attempt(request, scope, write).catch((error: unknown) => {
      // Another connection wrote between our lookup and our write: it stored the key first, or its
      // commit made our read snapshot stale. Everything we wrote was rolled back, so one more attempt
      // finds its result, or (if it wrote something else) writes anew. A real lock timeout is not
      // retried: it already waited `busy_timeout` and answers 500 (spec Q6).
      if (error instanceof KeyTakenError || isStaleSnapshot(error)) return this.attempt(request, scope, write);
      throw error;
    });
    if (attempt.kind === "written") return { data: attempt.data, replayed: false };
    return { data: await replay<T>(request, attempt.stored), replayed: true };
  }

  private attempt<T>(request: IdempotentWrite, scope: IdempotencyScope, write: () => Promise<T>): Promise<Attempt<T>> {
    // Reads first, the key's own writes last: the transaction takes SQLite's write lock only with the
    // handler's first write, after any slow work it awaits (a password hash). A lock held across such
    // an await would stall the whole process: better-sqlite3 waits for a lock synchronously, so a
    // second connection in this process (another Next.js bundle) would block the event loop.
    return inRequestTransaction(this.em, async () => {
      // Records at or before this instant are past their 24 hours (API-026).
      const expired = new Date(Date.now() - IDEMPOTENCY_TTL_MS);
      const state = scope.kind === "tenant" ? await this.checkGeneration(scope) : null;
      const stored = await this.find(request, scope, expired);
      if (stored) return { kind: "found", stored } as const;
      if (state) assertWritable(state);

      const data = await write();
      await this.purgeExpired(scope, expired);
      await this.store(request, state?.generation ?? null, data);
      return { kind: "written", data } as const;
    });
  }

  /** The tenant's current state, read fresh inside the transaction, once the sent generation matches it. */
  private async checkGeneration(scope: Extract<IdempotencyScope, { kind: "tenant" }>): Promise<TenantState> {
    const current = await this.tenantService.currentState(scope.tenant);
    assertCurrentGeneration(current.generation, scope.generation, scope.requireGeneration);
    return current;
  }

  /**
   * Deletes the store's records older than 24 hours, before inserting a new one: the tables keep
   * about one day of writes without a scheduler (spec Q7), and an expired key is free to reuse.
   */
  private async purgeExpired(scope: IdempotencyScope, expired: Date): Promise<void> {
    const where = { createdAt: { $lte: expired } };
    if (scope.kind === "global") await this.em.nativeDelete(GlobalIdempotencyKey, where);
    else await this.em.nativeDelete(TenantIdempotencyKey, where);
  }

  /** The account's live record for the key, read fresh: another request may have just stored it. */
  private async find({ userId, key }: IdempotentWrite, scope: IdempotencyScope, expired: Date): Promise<StoredKey | null> {
    const where = { userId, key, createdAt: { $gt: expired } };
    const options = { refresh: true } as const;
    return scope.kind === "global"
      ? this.em.findOne(GlobalIdempotencyKey, where, options)
      : this.em.findOne(TenantIdempotencyKey, where, options);
  }

  /** Inserts the key with the write's result: in the global store, or, given a generation, the tenant's. */
  private async store(request: IdempotentWrite, generation: number | null, data: unknown): Promise<void> {
    const record = {
      userId: request.userId,
      key: request.key,
      operation: request.operation,
      fingerprint: request.fingerprint.stored,
      // Stored as the JSON the response carries, so a replay answers the same bytes.
      response: JSON.parse(JSON.stringify(data ?? null)) as unknown,
    };
    // The write's own pending changes first, so their errors stay theirs (a taken name is a 409, not
    // a lost key race); only the key's insert below can mean another writer stored it first.
    await this.em.flush();
    if (generation === null) this.em.create(GlobalIdempotencyKey, record);
    else this.em.create(TenantIdempotencyKey, { ...record, generation });
    try {
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) throw new KeyTakenError();
      throw error;
    }
  }
}

/**
 * The first result for a matching repeat, or `IDEMPOTENCY_KEY_REUSED` naming what differed. Runs
 * after the transaction: an argon2 fingerprint check takes ~25 ms and must hold no lock (spec Q4).
 */
async function replay<T>(request: IdempotentWrite, stored: StoredKey): Promise<T> {
  if (await fingerprintMatches(stored.fingerprint, request.fingerprint.sha256)) return stored.response as T;
  if (stored.operation !== request.operation) {
    throw new ConflictError(
      `This Idempotency-Key was already used for another request (${stored.operation}). Use a new key for a new write.`,
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
  throw new ConflictError(
    "This Idempotency-Key was already used with a different body. Use a new key for a new write.",
    "IDEMPOTENCY_KEY_REUSED",
  );
}
