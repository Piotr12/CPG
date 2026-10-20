import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Material, selectTenant, Setting, TenantAuditEvent, type EntityManager, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { migrateDatabase, toDbOptions } from "../database";
import type { AuditActor } from "../services/audit/actor";
import { MaterialService } from "../services/materials/material.service";
import { AppError } from "./errors";
import { inRequestSavepoint, inRequestTransaction } from "./request-transaction";

const ACTOR: AuditActor = { userId: "admin-id", username: "admin", sessionId: "admin-session", channel: "ui", token: null };

/*
 * The import's apply pass (spec 2026-10-20--0908UTC-master-data-bom-import, Q6): real service calls,
 * one of them refused after it wrote, inside a savepoint of the request transaction. The fresh-context
 * review reproduced that a savepoint opened on a fork lets the services' same-named savepoints swallow
 * the rollback, so a refused middle row kept the first row's write.
 */
describe("inRequestSavepoint", () => {
  let orm: Orm;

  // A fresh database per test: the audit is append-only, so nothing can be cleaned between tests.
  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-request-savepoint-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
  });
  afterEach(() => orm.close());
  afterEach(() => vi.restoreAllMocks());

  const requestEm = () => {
    const em = orm.em.fork();
    selectTenant(em, "prod");
    return em;
  };

  const materials = async () => {
    const em = requestEm();
    return (await em.find(Material, {}, { orderBy: { code: "asc" } })).map((material) => material.description);
  };
  const auditEntries = () => requestEm().count(TenantAuditEvent, {});
  const settings = async () => (await orm.em.fork().find(Setting, {})).map((setting) => setting.key);

  /** A service call that writes and is then refused, as a lock refused at a later check would be. */
  async function refusedAfterWriting(em: EntityManager): Promise<void> {
    await em.transactional(async (inner) => {
      inner.create(Material, { code: "00000099", type: "raw", description: "half-written", baseUnit: "kg" });
      await inner.flush();
      throw new AppError("REFUSED", "Refused after writing.");
    });
  }

  /** Three rows through real services: the middle one refused, the error recorded, the run going on. */
  async function threeRows(em: EntityManager): Promise<string[]> {
    const service = new MaterialService({ em });
    const errors: string[] = [];
    await service.create({ type: "raw", description: "first", baseUnit: "kg" }, ACTOR);
    await refusedAfterWriting(em).catch((error: AppError) => errors.push(error.code));
    await service.create({ type: "raw", description: "third", baseUnit: "kg" }, ACTOR);
    return errors;
  }

  it("rolls back every row, the refused one's too, while the request transaction still commits its own write", async () => {
    const em = requestEm();

    const errors = await inRequestTransaction(em, async () => {
      const result = await inRequestSavepoint(em, () => threeRows(em), { keep: false });
      // The idempotency key's insert stands in here: global data written after the savepoint.
      em.create(Setting, { key: "after-dry-run", value: "1" });
      return result;
    });

    expect(errors).toEqual(["REFUSED"]);
    expect(await materials()).toEqual([]);
    expect(await auditEntries()).toBe(0);
    expect(await settings()).toEqual(["after-dry-run"]);
  });

  it("keeps the good rows and none of the refused one's write when kept", async () => {
    const em = requestEm();

    await inRequestTransaction(em, () => inRequestSavepoint(em, () => threeRows(em), { keep: true }));

    expect(await materials()).toEqual(["first", "third"]);
    expect(await auditEntries()).toBe(2);
  });

  it("leaves nothing in the identity map that a later flush could write", async () => {
    const em = requestEm();

    await inRequestTransaction(em, async () => {
      await inRequestSavepoint(
        em,
        async () => {
          await threeRows(em);
          // A change still pending when the savepoint ends: a rolled-back run must not flush it.
          (await em.findOneOrFail(Material, { description: "first" })).description = "dirty";
        },
        { keep: false },
      );
      expect(em.getUnitOfWork().getIdentityMap().keys()).toEqual([]);
      await em.flush();
    });

    expect(await materials()).toEqual([]);
  });

  it("rolls back to the savepoint and propagates a throw, and the request transaction can still commit", async () => {
    const em = requestEm();

    await inRequestTransaction(em, async () => {
      await expect(
        inRequestSavepoint(
          em,
          async () => {
            await threeRows(em);
            throw new AppError("IMPORT_STALE", "Stale.");
          },
          { keep: true },
        ),
      ).rejects.toThrow("Stale.");
      em.create(Setting, { key: "after-stale", value: "1" });
    });

    expect(await materials()).toEqual([]);
    expect(await settings()).toEqual(["after-stale"]);
  });

  it("logs a rollback that fails too, and throws the original error", async () => {
    const em = requestEm();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      inRequestTransaction(em, async () => {
        // The first rollback (the dry run's) fails, then the retry in the catch fails too; the
        // request transaction's own rollback then runs for real and undoes everything.
        vi.spyOn(em, "rollback").mockRejectedValueOnce(new Error("rollback broke")).mockRejectedValueOnce(new Error("again"));
        await inRequestSavepoint(em, () => threeRows(em), { keep: false });
      }),
    ).rejects.toThrow("rollback broke");

    expect(logged).toHaveBeenCalledWith("Savepoint rollback failed:", expect.objectContaining({ message: "again" }));
    expect(await materials()).toEqual([]);
  });

  it("refuses to run outside a request transaction", async () => {
    await expect(inRequestSavepoint(requestEm(), async () => "never", { keep: true })).rejects.toThrow(
      "inRequestSavepoint must run inside the request transaction.",
    );
  });
});
