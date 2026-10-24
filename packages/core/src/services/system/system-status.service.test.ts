import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, migrate, Setting, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { toDbOptions } from "../../database";
import { SystemStatusService } from "./system-status.service";

describe("SystemStatusService", () => {
  let config: ReturnType<typeof loadConfig>;
  let orm: Orm;

  beforeEach(async () => {
    config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-status-")) });
    orm = await initOrm(toDbOptions(config));
  });
  afterEach(() => orm.close());

  const service = () => new SystemStatusService({ config, orm, em: orm.em.fork() });

  it("pings the database, also while a transaction holds its connection (#185)", async () => {
    await expect(service().ping()).resolves.toBeUndefined();
    const writer = orm.em.fork();
    await writer.begin();
    try {
      const outcome = await Promise.race([service().ping().then(() => "answered"), new Promise<string>((resolve) => setTimeout(() => resolve("still waiting"), 300))]);
      expect(outcome).toBe("answered");
    } finally {
      await writer.rollback();
    }
  });

  it("reports pending migrations on a fresh database", async () => {
    await orm.schema.create();

    await expect(service().getStatus()).resolves.toEqual({
      databasePath: config.databasePath,
      appliedMigrations: 0,
      pendingMigrations: 31,
      settings: 0,
    });
  });

  it("reports applied migrations and the number of settings", async () => {
    await orm.close();
    await migrate(toDbOptions(config));
    orm = await initOrm(toDbOptions(config));
    const em = orm.em.fork();
    em.create(Setting, { key: "plan.horizon", value: "12" });
    await em.flush();

    await expect(service().getStatus()).resolves.toEqual({
      databasePath: config.databasePath,
      appliedMigrations: 31,
      pendingMigrations: 0,
      settings: 1,
    });
  });
});
