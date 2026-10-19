import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate, Setting, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { inRequestTransaction } from "./request-transaction";

describe("inRequestTransaction", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-request-tx-")), "cpg.sqlite");
  let orm: Orm;

  const settings = async () => (await orm.em.fork().find(Setting, {}, { orderBy: { key: "asc" } })).map((s) => s.key);

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());
  beforeEach(() => orm.em.fork().nativeDelete(Setting, {}));
  afterEach(() => vi.restoreAllMocks());

  it("commits what the callback persisted, flushing it first, and returns its result", async () => {
    const em = orm.em.fork();

    await expect(
      inRequestTransaction(em, async () => {
        em.create(Setting, { key: "committed", value: "1" });
        return "done";
      }),
    ).resolves.toBe("done");
    expect(await settings()).toEqual(["committed"]);
  });

  it("lets a service's own transaction on the same em join it, and roll back with it", async () => {
    const em = orm.em.fork();

    await expect(
      inRequestTransaction(em, async () => {
        await em.transactional(async (inner) => {
          inner.create(Setting, { key: "nested", value: "1" });
        });
        throw new Error("after the nested commit");
      }),
    ).rejects.toThrow("after the nested commit");
    expect(await settings()).toEqual([]);
  });

  it("rolls back and clears the em on failure, so nothing is flushed later", async () => {
    const em = orm.em.fork();

    await expect(
      inRequestTransaction(em, async () => {
        em.create(Setting, { key: "flushed-then-failed", value: "1" });
        await em.flush();
        em.create(Setting, { key: "never-flushed", value: "1" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await em.flush();
    expect(await settings()).toEqual([]);
  });

  it("reports the original error when the rollback fails too, logging the rollback's and clearing the em", async () => {
    const em = orm.em.fork();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rollback = em.rollback.bind(em);
    vi.spyOn(em, "rollback").mockImplementationOnce(async () => {
      await rollback();
      throw new Error("cannot rollback - no transaction is active");
    });

    await expect(
      inRequestTransaction(em, async () => {
        em.create(Setting, { key: "pending", value: "1" });
        throw new Error("the real cause");
      }),
    ).rejects.toThrow("the real cause");

    expect(log).toHaveBeenCalledWith("Rollback failed:", expect.objectContaining({ message: "cannot rollback - no transaction is active" }));
    await em.flush();
    expect(await settings()).toEqual([]);
  });
});
