import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { entities, initOrm, type Orm } from "@cpg/db";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";
import { toDbOptions } from "../database";
import { SystemStatusService } from "../services/system/system-status.service";
import { createAppContainer, getContainer, requestScope } from "./container";

describe("createAppContainer", () => {
  const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-container-")) });
  let orm: Orm;

  beforeAll(async () => {
    orm = await initOrm(toDbOptions(config));
  });
  afterAll(() => orm.close());

  it("registers the config, the ORM and the services", () => {
    const { cradle } = createAppContainer(config, orm);

    expect(cradle.config).toBe(config);
    expect(cradle.orm).toBe(orm);
    expect(cradle.systemStatusService).toBeInstanceOf(SystemStatusService);
  });

  it("gives every scope its own EntityManager fork", () => {
    const container = createAppContainer(config, orm);
    const first = container.createScope();
    const second = container.createScope();

    expect(first.cradle.em).toBe(first.cradle.em);
    expect(first.cradle.em).not.toBe(second.cradle.em);
    expect(first.cradle.em).not.toBe(orm.em);
  });

  it("rejects unregistered dependencies (strict mode)", () => {
    const container = createAppContainer(config, orm);

    expect(() => container.resolve("missing" as never)).toThrow();
  });
});

describe("getContainer / requestScope", () => {
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => (await getContainer()).cradle.orm.close());

  it("builds one container from the environment and hands out request scopes", async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), "cpg-global-"));
    vi.stubEnv("DATA_DIR", dataDir);

    const container = await getContainer();
    const scope = await requestScope();

    expect(await getContainer()).toBe(container);
    expect(container.cradle.config.dataDir).toBe(dataDir);
    expect(container.cradle.orm.config.get("entities")).toBe(entities);
    expect(scope).not.toBe(container);
    expect(scope.cradle.em).not.toBe((await requestScope()).cradle.em);
  });
});
