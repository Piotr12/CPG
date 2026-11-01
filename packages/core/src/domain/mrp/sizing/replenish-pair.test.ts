import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpBom, MrpPlanningParameters } from "../mrp-inputs";
import { replenishPair, type PairContext } from "./replenish-pair";
import { sizeProposals, type SizedPair } from "./size-proposals";

const q = (text: string) => parseDecimal(text)!;
const balance = (text: string) => (text.startsWith("-") ? -q(text.slice(1)) : q(text));
const DATES = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

/** A pair whose balances before proposals are `before`, against the targets `targets` (zero when omitted). */
const pair = (before: string[], targets: string[] = []): SizedPair => ({
  material: "M1",
  location: "L1",
  buckets: before.map((text, day) => ({ date: DATES[day], projectedBefore: balance(text), safetyTarget: q(targets[day] ?? "0") })),
});
const set = (overrides: Partial<MrpPlanningParameters> = {}): MrpPlanningParameters => ({
  material: "M1",
  location: "L1",
  materialType: "intermediate",
  procurement: "buy",
  leadTimeDays: 2,
  minimumQuantity: 0n,
  lotMultiple: q("1"),
  ...overrides,
});
const bom = (validFrom: string, validThrough: string | null = null): MrpBom => ({ output: "M1", validFrom, validThrough });
const context = (overrides: Partial<PairContext> = {}): PairContext => ({ unreadable: undefined, parameters: set(), invalidSet: false, boms: [], ...overrides });
/** Short on day 1 (3) and again on day 3 (2 more): two proposals with multiple 1. */
const SHORT = pair(["0", "-3", "-3", "-5"]);

describe("replenishPair", () => {
  it("gives a usable Buy set its proposals, exactly as sizeProposals sizes them, with no exception", () => {
    expect(replenishPair(SHORT, context())).toEqual({ proposals: sizeProposals(SHORT, set()), exception: null });
    expect(replenishPair(SHORT, context()).proposals).toHaveLength(2);
  });

  it("raises Invalid UoM Conversion with the first unreadable row, needed or not, and proposes nothing", () => {
    expect(replenishPair(SHORT, context({ unreadable: { record: "customer-order-line", document: "00000004/2" } }))).toEqual({
      proposals: [],
      exception: { code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "customer-order-line", document: "00000004/2" },
    });
    expect(replenishPair(pair(["5", "5", "5", "5"]), context({ unreadable: { record: "stock-balance" }, parameters: undefined }))).toEqual({
      proposals: [],
      exception: { code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "stock-balance" },
    });
  });

  it("puts Invalid UoM before every other exception, a set's included", () => {
    const exception = replenishPair(SHORT, context({ unreadable: { record: "transfer", document: "00000001" }, parameters: undefined, invalidSet: true })).exception;
    expect(exception?.code).toBe("INVALID_UOM_CONVERSION");
  });

  it("MAT-017: raises Missing Planning Parameters with no set, dated at the first day below the target, and proposes nothing", () => {
    expect(replenishPair(SHORT, context({ parameters: undefined }))).toEqual({
      proposals: [],
      exception: { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", date: "2026-10-02", reason: "no-set" },
    });
    // A target above the balance is a need too, from the first day.
    expect(replenishPair(pair(["6", "6", "6", "6"], ["10", "10", "10", "10"]), context({ parameters: undefined })).exception).toMatchObject({ date: "2026-10-01" });
  });

  it("raises nothing for a pair with no set and no need: at or above its target every day", () => {
    expect(replenishPair(pair(["10", "6", "6", "6"], ["0", "6", "6", "6"]), context({ parameters: undefined }))).toEqual({ proposals: [], exception: null });
  });

  it("MRP-033: reports a raw material's stored Make set as raw-make, needed or not, and never proposes production (R02)", () => {
    const raw = set({ materialType: "raw", procurement: "make" });
    expect(replenishPair(SHORT, context({ parameters: raw }))).toEqual({
      proposals: [],
      exception: { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", date: "2026-10-02", reason: "raw-make" },
    });
    expect(replenishPair(pair(["5", "5", "5", "5"]), context({ parameters: raw })).exception).toEqual({
      code: "MISSING_PLANNING_PARAMETERS",
      material: "M1",
      location: "L1",
      reason: "raw-make",
    });
  });

  it("reports a stored set whose lot data couldn't be read as invalid-set, needed or not", () => {
    expect(replenishPair(SHORT, context({ parameters: undefined, invalidSet: true })).exception).toMatchObject({ reason: "invalid-set", date: "2026-10-02" });
    expect(replenishPair(pair(["5", "5", "5", "5"]), context({ parameters: undefined, invalidSet: true })).exception).toEqual({
      code: "MISSING_PLANNING_PARAMETERS",
      material: "M1",
      location: "L1",
      reason: "invalid-set",
    });
  });

  describe("Missing BOM (MRP-035)", () => {
    const make = set({ procurement: "make" });
    const missing = (date: string) => ({ proposals: [], exception: { code: "MISSING_BOM", material: "M1", location: "L1", date } });

    it("raises it at the first proposal with no BOM at all, inactive ones being left out by the loader", () => {
      expect(replenishPair(SHORT, context({ parameters: make }))).toEqual(missing("2026-10-02"));
    });

    it("raises it when the current revision ends before the need, or starts after it", () => {
      expect(replenishPair(SHORT, context({ parameters: make, boms: [bom("2026-01-01", "2026-10-01")] }))).toEqual(missing("2026-10-02"));
      expect(replenishPair(SHORT, context({ parameters: make, boms: [bom("2026-10-05")] }))).toEqual(missing("2026-10-02"));
    });

    it("blocks every proposal when a later one has no valid BOM, dated at that one", () => {
      expect(replenishPair(SHORT, context({ parameters: make, boms: [bom("2026-01-01", "2026-10-03")] }))).toEqual(missing("2026-10-04"));
    });

    it("keeps the proposals when some BOM covers every need date, any of several", () => {
      const boms = [bom("2026-01-01", "2026-10-02"), bom("2026-10-03")];
      expect(replenishPair(SHORT, context({ parameters: make, boms }))).toEqual({ proposals: sizeProposals(SHORT, make), exception: null });
    });

    it("raises nothing for a Make pair with no proposal, and never asks a Buy pair for a BOM", () => {
      expect(replenishPair(pair(["5", "5", "5", "5"]), context({ parameters: make }))).toEqual({ proposals: [], exception: null });
      expect(replenishPair(SHORT, context({ boms: [] })).exception).toBeNull();
    });
  });
});
