import { describe, expect, it } from "vitest";
import type { MrpProvisionalAction } from "../mrp-result";
import { isMrpProvisionalCode, MRP_PROVISIONAL_CODE, readStoredProvisional, toStoredProvisional } from "./stored-provisional";

const action = (overrides: Partial<MrpProvisionalAction> = {}): MrpProvisionalAction => ({
  kind: "production-order",
  material: "00000001",
  location: "00000002",
  needDate: "2026-10-09",
  quantity: 6_000_000n,
  leadTimeDays: 3,
  plannedStart: "2026-10-06",
  plannedFinish: "2026-10-09",
  lateDays: 0,
  beyondHorizon: false,
  bom: "00000004",
  bomRevision: 2,
  components: [{ material: "00000012", quantity: 6_000_000n }, { material: "00000011", quantity: 1_500_000n }],
  blockers: ["provisional-demand"],
  rejectedBoms: [],
  ...overrides,
});

describe("stored provisional actions (E17-S03 spec Q8)", () => {
  it("are told apart from exceptions and warnings by their one code", () => {
    expect(isMrpProvisionalCode(MRP_PROVISIONAL_CODE)).toBe(true);
    expect(MRP_PROVISIONAL_CODE).toBe("PROVISIONAL_PRODUCTION");
    expect(isMrpProvisionalCode("NO_FEASIBLE_BOM")).toBe(false);
    expect(isMrpProvisionalCode("OVERDUE_SUPPLY")).toBe(false);
  });

  it("store an action driven by a parent on its need date, every figure a string, components as the action lists them", () => {
    expect(toStoredProvisional(action())).toEqual({
      code: "PROVISIONAL_PRODUCTION", material: "00000001", location: "00000002", date: "2026-10-09",
      details: { quantity: "6.000000", leadTimeDays: "3", bom: "00000004", bomRevision: "2", components: "00000012 6.000000, 00000011 1.500000", blockers: "provisional-demand" },
    });
  });

  it("store an infeasible action with No Feasible BOM's missing and inactive notations", () => {
    const stored = toStoredProvisional(action({
      blockers: ["no-feasible-bom", "provisional-demand"],
      rejectedBoms: [
        { bom: "00000003", revision: 1, reason: "inactive-component", materials: ["00000014"] },
        { bom: "00000004", revision: 2, reason: "shortage", shortages: [{ material: "00000012", required: 6_000_000n, available: 0n, shortage: 6_000_000n }] },
      ],
    }));
    expect(stored.details).toMatchObject({ blockers: "no-feasible-bom,provisional-demand", missing: "00000004/2: 00000012 6.000000 0.000000 6.000000", inactive: "00000003/1: 00000014" });
    expect(toStoredProvisional(action({ blockers: ["no-feasible-bom"], rejectedBoms: [] })).details).toMatchObject({ missing: "" });
    expect(toStoredProvisional(action()).details).not.toHaveProperty("missing");
  });

  it("read back what they store", () => {
    const infeasible = action({ blockers: ["no-feasible-bom", "provisional-demand"], rejectedBoms: [{ bom: "00000003", revision: 1, reason: "inactive-component", materials: ["00000014"] }] });
    const { date, details } = toStoredProvisional(infeasible);
    expect(readStoredProvisional(date, details)).toEqual({
      needDate: "2026-10-09", quantity: "6.000000", leadTimeDays: 3, bom: "00000004", bomRevision: 2,
      components: [{ material: "00000012", quantity: "6.000000" }, { material: "00000011", quantity: "1.500000" }],
      blockers: ["no-feasible-bom", "provisional-demand"], missing: "", inactive: "00000003/1: 00000014",
    });
    const plain = toStoredProvisional(action({ components: [] }));
    expect(readStoredProvisional(plain.date, plain.details)).toEqual(expect.objectContaining({ components: [], blockers: ["provisional-demand"] }));
    expect(readStoredProvisional(plain.date, plain.details)).not.toHaveProperty("missing");
  });

  it("drop a blocker a newer image wrote, keeping the ones this image knows in their order", () => {
    const { date, details } = toStoredProvisional(action());
    expect(readStoredProvisional(date, { ...details, blockers: "unknown-blocker,provisional-demand,no-feasible-bom" }).blockers).toEqual(["no-feasible-bom", "provisional-demand"]);
  });
});
