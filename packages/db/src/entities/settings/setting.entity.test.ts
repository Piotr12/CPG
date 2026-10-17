import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { initOrm, migrate, type Orm } from "../../orm";
import { Setting } from "./setting.entity";

describe("Setting", () => {
  const databasePath = path.join(mkdtempSync(path.join(tmpdir(), "cpg-setting-")), "cpg.sqlite");
  let orm: Orm;

  beforeAll(async () => {
    await migrate({ databasePath });
    orm = await initOrm({ databasePath });
  });
  afterAll(() => orm.close());

  it("stamps updatedAt on create and on every update", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-17T10:00:00Z") });
    try {
      const em = orm.em.fork();
      const setting = em.create(Setting, { key: "plan.horizon-weeks", value: "12" });
      await em.flush();
      expect(setting.updatedAt).toEqual(new Date("2026-10-17T10:00:00Z"));

      vi.setSystemTime(new Date("2026-10-17T11:00:00Z"));
      setting.value = "13";
      await em.flush();
      expect(setting.updatedAt).toEqual(new Date("2026-10-17T11:00:00Z"));

      const stored = await orm.em.fork().findOneOrFail(Setting, { key: "plan.horizon-weeks" });
      expect(stored).toMatchObject({ value: "13", updatedAt: new Date("2026-10-17T11:00:00Z") });
    } finally {
      vi.useRealTimers();
    }
  });
});
