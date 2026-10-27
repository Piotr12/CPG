import type { EventSubscriber, TransactionEventArgs } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/sqlite";

/*
 * One long write at a time across the ORM copies of this process. Next.js bundles route handlers,
 * pages and instrumentation separately, and each bundle gets its own ORM and SQLite connection
 * (lesson of 2026-10-17), so Kysely's connection mutex queues only the bundle a write runs in. A
 * transaction another bundle begins while the realistic Test reset holds the database would reach
 * SQLite mid-reset and get "database is locked" at once: in WAL mode a read-to-write upgrade skips
 * the busy handler. While a transaction holds the gate, a root transaction of any other connection in
 * the process waits for its commit or rollback instead, as every request did while the reset blocked
 * the event loop (#185). The gate is one record on `globalThis`, so every copy of this module sees
 * it; savepoints and the holder's own connection never wait.
 */

const GATE = Symbol.for("@cpg/db/write-gate");

/** The longest a transaction waits for the gate: kamal-proxy's response timeout, past which its request answers 504 anyway. */
export const WRITE_GATE_WAIT_MS = 600_000;

interface Gate {
  /** The holder's connection: the ORM copy whose transactions pass without waiting. */
  connection: object;
  /** Whether the holder's SQLite handle is still open: a closed one ended its transaction without a word. */
  alive: () => boolean;
  released: Promise<void>;
  release: () => void;
}

const registry = globalThis as typeof globalThis & { [GATE]?: Gate };

/** The gate in force, if its holder can still release it. */
function currentGate(): Gate | undefined {
  const gate = registry[GATE];
  if (gate && !gate.alive()) {
    delete registry[GATE];
    gate.release();
    return undefined;
  }
  return gate;
}

/**
 * Holds the gate for `em`'s open transaction until that transaction commits or rolls back. Call it
 * inside the transaction, after the reads a retried attempt repeats and before its first write; a
 * second call from the same connection changes nothing. A gate another connection still holds is
 * waited for first, so the transactions queued behind it are never orphaned; this transaction's
 * snapshot is then stale and its first write fails as such, which the request wrappers retry. Past
 * `waitMs` behind one holder it takes the gate anyway, as `WriteGate` lets a transaction through.
 * Production callers keep the default, kamal-proxy's response timeout; tests shorten it.
 */
export async function holdWriteGate(em: EntityManager, { waitMs = WRITE_GATE_WAIT_MS }: { waitMs?: number } = {}): Promise<void> {
  if (!em.isInTransaction()) throw new Error("holdWriteGate needs an open transaction to hold the gate for.");
  const connection = em.getConnection();
  const database = await connection.getNativeClient();
  // Look again after every wait, and take the gate with no await between the last look and the take:
  // two holders asking in the same tick would otherwise both find it free and both hold it (#274).
  for (let gate = currentGate(); gate; gate = currentGate()) {
    if (gate.connection === connection) return;
    if (!(await releasedWithin(gate, waitMs))) break;
  }
  let release!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  registry[GATE] = { connection, alive: () => database.open, released, release };
}

/** Waits while another connection holds the gate, at most `ms` per holder; a released gate may have passed to the next one. */
async function foreignGateReleased(connection: object, ms: number): Promise<void> {
  for (let gate = currentGate(); gate && gate.connection !== connection; gate = currentGate()) {
    if (!(await releasedWithin(gate, ms))) return;
  }
}

/** True once the gate is released, false after `ms` when its holder never lets go. */
function releasedWithin(gate: Gate, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    timer.unref();
    void gate.released.then(() => { clearTimeout(timer); resolve(true); });
  });
}

/** A root transaction of another connection waits while the gate is held; the holder's commit or rollback releases it. */
export class WriteGate implements EventSubscriber {
  private readonly waitMs: number;

  constructor({ waitMs = WRITE_GATE_WAIT_MS }: { waitMs?: number } = {}) {
    this.waitMs = waitMs;
  }

  async beforeTransactionStart({ em, transaction }: TransactionEventArgs): Promise<void> {
    // A savepoint's root transaction already passed the gate or holds it; the holder's own bundle
    // queues on Kysely's connection mutex instead.
    if (transaction) return;
    await foreignGateReleased(em.getConnection(), this.waitMs);
  }

  afterTransactionCommit(args: TransactionEventArgs): void {
    releaseIfHolder(args);
  }

  afterTransactionRollback(args: TransactionEventArgs): void {
    releaseIfHolder(args);
  }
}

function releaseIfHolder({ em, transaction }: TransactionEventArgs): void {
  const gate = registry[GATE];
  if (!gate || gate.connection !== em.getConnection() || (transaction && "savepointName" in transaction)) return;
  delete registry[GATE];
  gate.release();
}
