import type { MrpRun } from "@cpg/db";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { MrpBucket } from "../../domain/mrp/mrp-result";
import { MRP_FIGURES, toRunView, type MrpFigure } from "./mrp-run-view";

describe("MRP_FIGURES", () => {
  it("names every figure of the engine's bucket once, so a figure a later story adds is stored and shown too", () => {
    expectTypeOf<MrpFigure>().toEqualTypeOf<Exclude<keyof MrpBucket, "date">>();
    expect(new Set(MRP_FIGURES).size).toBe(MRP_FIGURES.length);
  });
});

describe("toRunView", () => {
  it("shows the run by its business ID and account, with the last planned day", () => {
    const createdAt = new Date("2026-12-15T08:00:00.000Z");
    const run = {
      id: "uuid", code: "00000003", createdAt, startDate: "2026-12-15", horizonDays: 90, mode: "manual", generation: 4, pairs: 12,
      actorUserId: "anna-id", actorUsername: "anna", channel: "api",
    } as MrpRun;

    expect(toRunView(run)).toEqual({
      id: "00000003", createdAt, account: "anna", channel: "api", mode: "manual", generation: 4,
      startDate: "2026-12-15", endDate: "2027-03-14", horizonDays: 90, pairs: 12,
    });
  });
});
