import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Options } from "@mikro-orm/sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { Setting } from "./entities";
import { initOrm, LockWaitTimeoutException, migrate, type EntityManager, type Orm } from "./orm";
import { TenantGuard } from "./tenants/tenant-guard";
import { holdWriteGate, WriteGate } from "./write-gate";

const opened: Orm[] = [];
afterEach(async () => {
  for (const orm of opened.splice(0)) await orm.close();
});

/** Two ORMs on one migrated file: what two Next.js bundles have in one process. */
async function twoOrms(overridesForB: Partial<Options> = {}) {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-write-gate-")), "cpg.sqlite");
  await migrate({ databasePath });
  const a = await initOrm({ databasePath });
  const b = await initOrm({ databasePath }, overridesForB);
  opened.push(a, b);
  return { a, b };
}

/** "pending" when `promise` hasn't settled within `ms`, whichever way. */
const settled = (promise: Promise<unknown>, ms = 150) =>
  Promise.race([promise.then(() => "settled", () => "settled"), new Promise<string>((resolve) => setTimeout(() => resolve("pending"), ms))]);

/** A write the way a request makes it: a read, then an insert, in its own root transaction. */
const write = (orm: Orm, key: string) =>
  orm.em.fork().transactional(async (em) => {
    await em.count(Setting, {});
    em.create(Setting, { key, value: "1" });
  });

/** Holds the gate in a transaction that has already written, as the reset has by its first yield to the event loop. */
async function holdAndWrite(orm: Orm): Promise<EntityManager> {
  const em = orm.em.fork();
  await em.begin();
  await holdWriteGate(em);
  em.create(Setting, { key: "holder", value: "1" });
  await em.flush();
  return em;
}

describe("the write gate", () => {
  it("makes a root transaction another ORM begins wait for the holder's commit, then lets it succeed", async () => {
    const { a, b } = await twoOrms();
    const holder = await holdAndWrite(a);
    const writing = write(b, "waited");

    expect(await settled(writing)).toBe("pending");
    await holder.commit();
    await writing;

    expect(await b.em.fork().count(Setting, { key: "waited" })).toBe(1);
  });

  it("without the gate the same transaction fails at once with database is locked: the regression it prevents (#185)", async () => {
    const { a, b } = await twoOrms({ subscribers: [new TenantGuard()] });
    const holder = await holdAndWrite(a);
    try {
      const refused = await write(b, "refused").then(() => null, (error: unknown) => error);
      expect(refused).toBeInstanceOf(LockWaitTimeoutException);
      expect(refused).toMatchObject({ code: "SQLITE_BUSY" });
    } finally {
      await holder.rollback();
    }
  });

  it("releases on the holder's rollback too", async () => {
    const { a, b } = await twoOrms();
    const holder = await holdAndWrite(a);
    const writing = write(b, "after-rollback");

    expect(await settled(writing)).toBe("pending");
    await holder.rollback();
    await writing;

    expect(await b.em.fork().count(Setting, { key: "holder" })).toBe(0);
    expect(await b.em.fork().count(Setting, { key: "after-rollback" })).toBe(1);
  });

  it("never holds up the holder's own savepoints, and its own bundle queues on the connection mutex, not the gate", async () => {
    const { a, b } = await twoOrms();
    const holder = await holdAndWrite(a);
    // The reset's services open savepoints on the holding transaction thousands of times.
    await holder.transactional(async (em) => { em.create(Setting, { key: "nested", value: "1" }); });
    // Holding again from the same connection changes nothing.
    await holdWriteGate(holder);
    const ownBundle = write(a, "own-bundle");

    expect(await settled(ownBundle)).toBe("pending");
    await holder.commit();
    await ownBundle;

    expect((await b.em.fork().find(Setting, {}, { orderBy: { key: "asc" } })).map(({ key }) => key)).toEqual(["holder", "nested", "own-bundle"]);
  });

  it("lets a second holder wait for the first and take over, so nobody queued behind either is orphaned", async () => {
    const { a, b } = await twoOrms();
    const c = await initOrm({ databasePath: a.config.get("dbName") });
    opened.push(c);
    // The second holder's transaction began before the first held the gate, so it never waited at its begin.
    const second = b.em.fork();
    await second.begin();
    const first = await holdAndWrite(a);
    const holdingSecond = holdWriteGate(second);
    const queuedBehindFirst = write(c, "queued-behind-first");

    expect(await settled(holdingSecond)).toBe("pending");
    await first.commit();
    await holdingSecond;
    // The second holder's snapshot predates the first's commit, so its first write is refused as stale: the
    // request wrappers retry the whole transaction. Here it writes nothing and just holds.
    const queuedBehindSecond = write(c, "queued-behind-second");
    expect(await settled(queuedBehindSecond)).toBe("pending");
    await second.commit();
    await Promise.all([queuedBehindFirst, queuedBehindSecond]);

    expect((await c.em.fork().find(Setting, { key: { $like: "queued-%" } })).map(({ key }) => key).sort()).toEqual(["queued-behind-first", "queued-behind-second"]);
  });

  it("gives the gate to one of two holders that ask in the same tick, and makes the other wait for it", async () => {
    const { a, b } = await twoOrms();
    const first = a.em.fork();
    const second = b.em.fork();
    await first.begin();
    await second.begin();
    // Neither has awaited anything when the other asks: both found the gate free before either took it (#274).
    const holdingFirst = holdWriteGate(first);
    const holdingSecond = holdWriteGate(second);

    await holdingFirst;
    expect(await settled(holdingSecond)).toBe("pending");
    await first.commit();
    await holdingSecond;
    await second.commit();
  });

  it("lets a holder wait at most its bound behind another one, then take the gate", async () => {
    const { a, b } = await twoOrms();
    // Begun before the first holds the gate, or its begin would wait for it.
    const second = b.em.fork();
    await second.begin();
    const first = await holdAndWrite(a);
    try {
      const started = performance.now();
      await holdWriteGate(second, { waitMs: 50 });
      // A timer may fire a fraction of a millisecond early by `performance.now()` (49.99 ms under coverage).
      expect(performance.now() - started).toBeGreaterThanOrEqual(45);
      // The late holder holds it now: a call from the first holder's connection no longer returns at once.
      expect(await settled(holdWriteGate(first, { waitMs: 50 }), 25)).toBe("pending");
    } finally {
      await second.rollback();
      await first.rollback();
    }
  });

  it("gates a native write only inside a transaction: wrap such writes, an autocommit one busy-waits in C instead", async () => {
    const { a, b } = await twoOrms();
    const holder = await holdAndWrite(a);
    const touching = b.em.fork().transactional((em) => em.nativeUpdate(Setting, { key: "holder" }, { value: "touched" }));

    expect(await settled(touching)).toBe("pending");
    await holder.commit();
    expect(await touching).toBe(1);

    expect((await b.em.fork().findOneOrFail(Setting, { key: "holder" })).value).toBe("touched");
  });

  it("drops a gate whose holder closed its connection without ending the transaction", async () => {
    const { a, b } = await twoOrms();
    await holdAndWrite(a);
    opened.splice(opened.indexOf(a), 1);
    await a.close();

    expect(await settled(write(b, "after-close"))).toBe("settled");
    expect(await b.em.fork().count(Setting, { key: "after-close" })).toBe(1);
  });

  it("waits at most its bound, then takes SQLite's own answer", async () => {
    const { a, b } = await twoOrms({ subscribers: [new TenantGuard(), new WriteGate({ waitMs: 50 })] });
    const holder = await holdAndWrite(a);
    try {
      const started = performance.now();
      const refused = await write(b, "late").then(() => null, (error: unknown) => error);
      expect(performance.now() - started).toBeGreaterThanOrEqual(50);
      expect(refused).toMatchObject({ code: "SQLITE_BUSY" });
    } finally {
      await holder.rollback();
    }
  });

  it("can only be held for an open transaction", async () => {
    const { a } = await twoOrms();
    await expect(holdWriteGate(a.em.fork())).rejects.toThrow("holdWriteGate needs an open transaction");
  });
});
