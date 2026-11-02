import { describe, expect, it } from "vitest";
import { rejectionDetails } from "../exceptions/stored-exception";
import type { MrpBomRejection } from "../mrp-result";
import { exceptionRejections, isMrpBomRejectionsCode, MRP_BOM_REJECTIONS_CODE, readBomRejections, toStoredBomRejections } from "./bom-rejections";

const shortage = (bom: string, revision: number, ...lines: [string, bigint, bigint][]): MrpBomRejection => ({
  bom, revision, reason: "shortage",
  shortages: lines.map(([material, required, available]) => ({ material, required, available, shortage: required - available })),
});
const inactive = (bom: string, revision: number, ...materials: string[]): MrpBomRejection => ({ bom, revision, reason: "inactive-component", materials });

describe("a feasible fallback's stored rejections (E18-S03 spec Q1)", () => {
  it("are told apart from exceptions, warnings and provisional actions by their one code", () => {
    expect(MRP_BOM_REJECTIONS_CODE).toBe("BOM_REJECTIONS");
    expect(isMrpBomRejectionsCode("BOM_REJECTIONS")).toBe(true);
    expect(isMrpBomRejectionsCode("NO_FEASIBLE_BOM")).toBe(false);
    expect(isMrpBomRejectionsCode("PROVISIONAL_PRODUCTION")).toBe(false);
  });

  it("store a fallback on its need date in the No Feasible BOM notation, with the engine's order", () => {
    // UX-020: priority 1 needs 6 A with 5 dependable; priority 2 was chosen.
    const stored = toStoredBomRejections({ material: "00000001", location: "00000002", needDate: "2026-11-06", rejectedBoms: [shortage("00000004", 1, ["00000013", 6_000_000n, 5_000_000n])] });
    expect(stored).toEqual({
      code: "BOM_REJECTIONS", material: "00000001", location: "00000002", date: "2026-11-06",
      details: { missing: "00000004/1: 00000013 6.000000 5.000000 1.000000", order: "00000004/1" },
    });
  });

  it("store nothing for a proposal that passed over no BOM: a requisition, or its first choice", () => {
    expect(toStoredBomRejections({ material: "00000001", location: "00000002", needDate: "2026-11-06", rejectedBoms: [] })).toBeNull();
  });
});

describe("readBomRejections (E18-S03 spec Q2, Q3)", () => {
  it("reads back what rejectionDetails wrote, in the engine's order across both reasons", () => {
    // Engine order puts the inactive priority 1 before the short priority 2, which BOM ID order would swap.
    const rejections = [inactive("00000009", 1, "00000021", "00000022"), shortage("00000004", 2, ["00000013", 6_000_000n, 5_000_000n], ["00000014", 500_000n, 0n])];
    expect(readBomRejections(rejectionDetails(rejections))).toEqual([
      { bom: "00000009", revision: 1, reason: "inactive-component", materials: ["00000021", "00000022"] },
      { bom: "00000004", revision: 2, reason: "shortage", shortages: [
        { material: "00000013", required: "6.000000", available: "5.000000", shortage: "1.000000" },
        { material: "00000014", required: "0.500000", available: "0.000000", shortage: "0.500000" },
      ] },
    ]);
  });

  it("reads an inactive-only row, whose missing is empty, as no shortage", () => {
    const details = rejectionDetails([inactive("00000003", 1, "00000014")]);
    expect(details.missing).toBe("");
    expect(readBomRejections(details)).toEqual([{ bom: "00000003", revision: 1, reason: "inactive-component", materials: ["00000014"] }]);
  });

  it("lists a row an older image wrote without order by BOM, then revision", () => {
    expect(readBomRejections({ missing: "00000009/1: 00000013 1.000000 0.000000 1.000000", inactive: "00000004/2: 00000021; 00000004/1: 00000022" }).map(({ bom, revision }) => `${bom}/${revision}`))
      .toEqual(["00000004/1", "00000004/2", "00000009/1"]);
  });

  it("puts a BOM the order doesn't name last", () => {
    expect(readBomRejections({ missing: "", inactive: "00000001/1: 00000021; 00000002/1: 00000022", order: "00000002/1" }).map(({ bom }) => bom)).toEqual(["00000002", "00000001"]);
  });

  it("drops an entry it can't read, written by a newer image, and keeps the rest", () => {
    expect(readBomRejections({
      missing: "garbage; 00000004/x: 00000013 1.000000 0.000000 1.000000; 00000005/1: 00000013 1 0 1; 00000006/1: 00000013 1.000000 0.000000 1.000000 extra; 00000007/1: 00000013 2.000000 1.000000 1.000000",
      inactive: "no-colon",
    })).toEqual([{ bom: "00000007", revision: 1, reason: "shortage", shortages: [{ material: "00000013", required: "2.000000", available: "1.000000", shortage: "1.000000" }] }]);
    expect(readBomRejections({})).toEqual([]);
  });
});

describe("exceptionRejections (E18-S03 spec Q2)", () => {
  it("explains No Feasible BOM from its stored notation, in engine order", () => {
    const details = rejectionDetails([shortage("00000009", 1, ["00000013", 6_000_000n, 5_000_000n]), inactive("00000004", 1, "00000021")]);
    expect(exceptionRejections("NO_FEASIBLE_BOM", details)?.map(({ bom, reason }) => [bom, reason])).toEqual([["00000009", "shortage"], ["00000004", "inactive-component"]]);
    expect(exceptionRejections("NO_FEASIBLE_BOM", null)).toEqual([]);
  });

  it("explains Missing Usable BOM from its inactive list, keeping its engine order", () => {
    expect(exceptionRejections("MISSING_USABLE_BOM", { inactive: "00000009/1: 00000021; 00000004/2: 00000022, 00000023" })).toEqual([
      { bom: "00000009", revision: 1, reason: "inactive-component", materials: ["00000021"] },
      { bom: "00000004", revision: 2, reason: "inactive-component", materials: ["00000022", "00000023"] },
    ]);
    expect(exceptionRejections("MISSING_USABLE_BOM", null)).toEqual([]);
  });

  it("gives every other code none", () => {
    expect(exceptionRejections("MISSING_BOM", null)).toBeUndefined();
    expect(exceptionRejections("AT_RISK_PRODUCTION", { order: "00000007" })).toBeUndefined();
  });
});
