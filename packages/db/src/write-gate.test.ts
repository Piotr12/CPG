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
