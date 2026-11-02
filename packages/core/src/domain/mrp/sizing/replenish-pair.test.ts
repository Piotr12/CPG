import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpBom, MrpPlanningParameters } from "../mrp-inputs";
import { replenishPair, type PairContext, type ReplenishedPair } from "./replenish-pair";
import { scheduleProposal } from "./schedule-proposal";
import { sizeProposals, type SizedPair } from "./size-proposals";

const q = (text: string) => parseDecimal(text)!;
const balance = (text: string) => (text.startsWith("-") ? -q(text.slice(1)) : q(text));
const DATES = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

/** A pair whose balances before proposals are `before`, against the targets `targets` (zero when omitted). */
const pair = (before: string[], targets: string[] = []): ReplenishedPair => ({
  material: "M1",
  location: "L1",
  buckets: before.map((text, day) => ({ date: DATES[day], projectedBefore: balance(text), safetyTarget: q(targets[day] ?? "0"), atRiskSupply: 0n })),
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
const bom = (validFrom: string, validThrough: string | null = null, overrides: Partial<MrpBom> = {}): MrpBom => ({
  bom: "00000001",
  revision: 1,
  priority: 1,
  output: "M1",
  validFrom,
  validThrough,
  inactiveComponents: [],
  components: [],
  ...overrides,
});
/** A run start well before the days, so every proposal is on time unless a test moves it. */
const EARLY = "2026-09-01";
const context = (overrides: Partial<PairContext> = {}): PairContext => ({
  unreadable: undefined,
  parameters: set(),
  invalidSet: false,
  boms: [],
  today: EARLY,
  cycle: undefined,
  provisional: null,
  ...overrides,
});
/** What sizing proposes, timed from `today` as `replenishPair` times it. */
const timed = (sized: SizedPair, parameters: MrpPlanningParameters, today = EARLY) =>
  sizeProposals(sized, parameters).map((item) => ({ ...item, ...scheduleProposal(item.needDate, item.leadTimeDays, today, 90) }));
/** Short on day 1 (3) and again on day 3 (2 more): two proposals with multiple 1. */
const SHORT = pair(["0", "-3", "-3", "-5"]);

describe("replenishPair", () => {
  it("gives a usable Buy set its proposals, exactly as sizeProposals sizes them, with no exception", () => {
    expect(replenishPair(SHORT, context())).toEqual({ proposals: timed(SHORT, set()), provisional: [], exception: null });
    expect(replenishPair(SHORT, context()).proposals.map(({ plannedFinish, lateDays }) => [plannedFinish, lateDays])).toEqual([["2026-10-02", 0], ["2026-10-04", 0]]);
    expect(replenishPair(SHORT, context()).proposals).toHaveLength(2);
  });

  it("raises Invalid UoM Conversion with the first unreadable row, needed or not, and proposes nothing", () => {
    expect(replenishPair(SHORT, context({ unreadable: { record: "customer-order-line", document: "00000004/2" } }))).toEqual({
      proposals: [],
      provisional: [],
      exception: { code: "INVALID_UOM_CONVERSION", material: "M1", location: "L1", record: "customer-order-line", document: "00000004/2" },
    });
    expect(replenishPair(pair(["5", "5", "5", "5"]), context({ unreadable: { record: "stock-balance" }, parameters: undefined }))).toEqual({
      proposals: [],
      provisional: [],
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
      provisional: [],
      exception: { code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", date: "2026-10-02", reason: "no-set" },
    });
    // A target above the balance is a need too, from the first day.
    expect(replenishPair(pair(["6", "6", "6", "6"], ["10", "10", "10", "10"]), context({ parameters: undefined })).exception).toMatchObject({ date: "2026-10-01" });
  });

  it("raises nothing for a pair with no set and no need: at or above its target every day", () => {
    expect(replenishPair(pair(["10", "6", "6", "6"], ["0", "6", "6", "6"]), context({ parameters: undefined }))).toEqual({ proposals: [], provisional: [], exception: null });
  });

  it("MRP-033: reports a raw material's stored Make set as raw-make, needed or not, and never proposes production (R02)", () => {
    const raw = set({ materialType: "raw", procurement: "make" });
    expect(replenishPair(SHORT, context({ parameters: raw }))).toEqual({
      proposals: [],
      provisional: [],
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

  describe("BOM Cycle (MRP-028, #281 Q7)", () => {
    const PATH = "M1 →(BOM 00000001) M2 →(BOM 00000002) M1";
    const make = set({ procurement: "make" });

    it("gives a Make pair of a material on a cycle BOM Cycle naming the path, needed or not, and no proposal", () => {
      const exception = { code: "CYCLIC_BOM", material: "M1", location: "L1", path: PATH };
      expect(replenishPair(SHORT, context({ parameters: make, boms: [bom("2026-01-01")], cycle: PATH }))).toEqual({ proposals: [], provisional: [], exception });
      expect(replenishPair(pair(["5", "5", "5", "5"]), context({ parameters: make, cycle: PATH }))).toEqual({ proposals: [], provisional: [], exception });
    });

    it("still proposes for a Buy pair of a material on a cycle: the BOM is never used there", () => {
      expect(replenishPair(SHORT, context({ cycle: PATH }))).toEqual({ proposals: timed(SHORT, set()), provisional: [], exception: null });
    });

    it("leaves the parameter exceptions before it", () => {
      expect(replenishPair(SHORT, context({ parameters: set({ procurement: "make", materialType: "raw" }), cycle: PATH })).exception).toMatchObject({ reason: "raw-make" });
      expect(replenishPair(SHORT, context({ parameters: undefined, invalidSet: true, cycle: PATH })).exception).toMatchObject({ reason: "invalid-set" });
      expect(replenishPair(SHORT, context({ parameters: undefined, cycle: PATH })).exception).toMatchObject({ reason: "no-set" });
    });
  });

  describe("Missing BOM (MRP-035)", () => {
    const make = set({ procurement: "make" });
    const missing = (date: string) => ({ proposals: [], provisional: [], exception: { code: "MISSING_BOM", material: "M1", location: "L1", date } });

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
      expect(replenishPair(SHORT, context({ parameters: make, boms }))).toEqual({ proposals: timed(SHORT, make), provisional: [], exception: null });
    });

    // Run on 10-01 with a 7-day lead time: both needs (10-02, 10-04) are late and finish on 10-08,
    // the day the production order would check its BOM (#317 review).
    const late = set({ procurement: "make", leadTimeDays: 7 });
    const lateContext = (boms: MrpBom[]) => context({ parameters: late, boms, today: "2026-10-01" });

    it("checks a late proposal's BOM on its planned finish: a revision from after the need but by the finish covers it", () => {
      const replenished = replenishPair(SHORT, lateContext([bom("2026-10-06")]));
      expect(replenished).toEqual({ proposals: timed(SHORT, late, "2026-10-01"), provisional: [], exception: null });
      expect(replenished.proposals.map(({ needDate, plannedFinish, lateDays }) => [needDate, plannedFinish, lateDays])).toEqual([
        ["2026-10-02", "2026-10-08", 6],
        ["2026-10-04", "2026-10-08", 4],
      ]);
    });

    it("raises it, dated at the planned finish, when the revision covers a late proposal's need but ends before its finish", () => {
      expect(replenishPair(SHORT, lateContext([bom("2026-01-01", "2026-10-05")]))).toEqual(missing("2026-10-08"));
    });

    it("raises nothing for a Make pair with no proposal, and never asks a Buy pair for a BOM", () => {
      expect(replenishPair(pair(["5", "5", "5", "5"]), context({ parameters: make }))).toEqual({ proposals: [], provisional: [], exception: null });
      expect(replenishPair(SHORT, context({ boms: [] })).exception).toBeNull();
    });
  });

  describe("Missing Usable BOM (#282, LFC-026, MRP-050)", () => {
    const make = set({ procurement: "make" });
    const withR = bom("2026-01-01", null, { bom: "00000004", priority: 1, inactiveComponents: ["R"] });
    const withRS = bom("2026-01-01", null, { bom: "00000005", priority: 2, inactiveComponents: ["R", "S"] });

    it("LFC-026: raises it when every BOM valid on a proposal's finish has an inactive component, dated at the first, naming them, and proposes nothing", () => {
      expect(replenishPair(SHORT, context({ parameters: make, boms: [withRS, withR] }))).toEqual({
        proposals: [],
        provisional: [],
        exception: {
          code: "MISSING_USABLE_BOM",
          material: "M1",
          location: "L1",
          date: "2026-10-02",
          inactive: [
            { bom: "00000004", revision: 1, materials: ["R"] },
            { bom: "00000005", revision: 1, materials: ["R", "S"] },
          ],
        },
      });
    });

    it("raises it for an earlier proposal when the only usable BOM is valid from a later one's finish, listing only that day's valid BOMs", () => {
      const later = bom("2026-10-03", null, { bom: "00000006" });
      expect(replenishPair(SHORT, context({ parameters: make, boms: [withR, later] })).exception).toEqual({
        code: "MISSING_USABLE_BOM", material: "M1", location: "L1", date: "2026-10-02", inactive: [{ bom: "00000004", revision: 1, materials: ["R"] }],
      });
    });

    it("keeps the proposals when a usable BOM covers every finish beside an unusable one", () => {
      expect(replenishPair(SHORT, context({ parameters: make, boms: [withR, bom("2026-01-01", null, { bom: "00000006", priority: 2 })] }))).toEqual({
        proposals: timed(SHORT, make),
        provisional: [],
        exception: null,
      });
    });

    it("comes after Missing BOM: a proposal with no valid BOM at all is Missing BOM, even beside an unusable one for another day", () => {
      expect(replenishPair(SHORT, context({ parameters: make, boms: [bom("2026-10-04", null, { inactiveComponents: ["R"] })] })).exception).toEqual({
        code: "MISSING_BOM", material: "M1", location: "L1", date: "2026-10-02",
      });
    });
  });

  describe("at-risk and provisional demand (E17-S03)", () => {
    const make = set({ procurement: "make" });
    const boms = [bom("2026-01-01")];
    /** `pair(before)` with `atRisk` at-risk output on each day. */
    const withAtRisk = (before: string[], atRisk: string[]): ReplenishedPair => {
      const base = pair(before);
      return { ...base, buckets: base.buckets.map((bucket, day) => ({ ...bucket, atRiskSupply: q(atRisk[day]) })) };
    };
    const provisional = (texts: string[]) => texts.map(q);

    it("blocks the demand at-risk output was to cover: only the excess is proposed (spec Q2)", () => {
      // 3 at risk on day 1 covers day 1's shortage, so only day 3's 2 more is proposed.
      const replenished = replenishPair(withAtRisk(["0", "-3", "-3", "-5"], ["0", "3", "0", "0"]), context());
      expect(replenished.proposals.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([["2026-10-04", q("2")]]);
    });

    it("reads the blocked balance for the first need too: a pair whose only need at-risk output covers needs no set", () => {
      expect(replenishPair(withAtRisk(["0", "-3", "-3", "-3"], ["0", "3", "0", "0"]), context({ parameters: undefined }))).toEqual({ proposals: [], provisional: [], exception: null });
    });

    it("sizes a Make pair without its provisional demand, then that demand alone on top of the executable proposals (spec Q6)", () => {
      // Real demand: 3 on day 1. Provisional: 2 more on day 3.
      const replenished = replenishPair(SHORT, context({ parameters: make, boms, provisional: provisional(["0", "0", "0", "2"]) }));
      expect(replenished.exception).toBeNull();
      expect(replenished.proposals.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([["2026-10-02", q("3")]]);
      expect(replenished.provisional.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([["2026-10-04", q("2")]]);
      expect(replenished.provisional[0]).toMatchObject({ kind: "production-order", plannedFinish: "2026-10-04", lateDays: 0 });
    });

    it("sizes a Buy pair once on all its demand, so its requisitions cover provisional needs and none is provisional (spec Q5)", () => {
      expect(replenishPair(SHORT, context({ provisional: provisional(["0", "0", "0", "2"]) }))).toEqual({ proposals: timed(SHORT, set()), provisional: [], exception: null });
    });

    it("raises Missing Planning Parameters on a pair needed only provisionally, dated at that need", () => {
      expect(replenishPair(pair(["0", "0", "-2", "-2"]), context({ parameters: undefined, provisional: provisional(["0", "0", "2", "0"]) })).exception).toEqual({
        code: "MISSING_PLANNING_PARAMETERS", material: "M1", location: "L1", date: "2026-10-03", reason: "no-set",
      });
    });

    it("tests the provisional proposals for a BOM too, dating Missing BOM at the earliest proposal of both lists", () => {
      // Real need on day 3, provisional on day 1: no BOM before 4 October, so the provisional day-1 proposal dates it.
      const replenished = replenishPair(pair(["0", "-2", "-2", "-5"]), context({ parameters: make, boms: [bom("2026-10-04")], provisional: provisional(["0", "2", "0", "0"]) }));
      expect(replenished).toEqual({ proposals: [], provisional: [], exception: { code: "MISSING_BOM", material: "M1", location: "L1", date: "2026-10-02" } });
    });
  });
});
