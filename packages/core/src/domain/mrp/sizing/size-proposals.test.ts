import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpPlanningParameters } from "../mrp-inputs";
import { sizeProposals, type SizedPair } from "./size-proposals";

const q = (text: string) => parseDecimal(text)!;
/** A signed balance: `parseDecimal` takes values of zero or more only. */
const balance = (text: string) => (text.startsWith("-") ? -q(text.slice(1)) : q(text));
const DATES = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];

/** A pair whose balances before proposals are `before`, against the safety targets `targets` (zero when omitted). */
const pair = (before: string[], targets: string[] = []): SizedPair => ({
  material: "M1",
  location: "L1",
  buckets: before.map((text, day) => ({ date: DATES[day], projectedBefore: balance(text), safetyTarget: q(targets[day] ?? "0") })),
});

const parameters = (overrides: Partial<MrpPlanningParameters> = {}): MrpPlanningParameters => ({
  material: "M1",
  location: "L1",
  materialType: "intermediate",
  procurement: "buy",
  leadTimeDays: 7,
  minimumQuantity: 0n,
  lotMultiple: q("1"),
  ...overrides,
});

describe("sizeProposals", () => {
  it("proposes a purchase requisition for Buy, carrying the need date, the receipt day and the lead time", () => {
    expect(sizeProposals(pair(["5", "-3", "-3", "-3"]), parameters())).toEqual([
      { kind: "purchase-requisition", material: "M1", location: "L1", needDate: "2026-10-02", date: "2026-10-02", quantity: q("3"), leadTimeDays: 7 },
    ]);
  });

  it("proposes a production order for Make", () => {
    expect(sizeProposals(pair(["-3", "-3", "-3", "-3"]), parameters({ procurement: "make" })).map(({ kind }) => kind)).toEqual(["production-order"]);
  });

  it("proposes nothing for a raw material whose set says Make, whatever its shortage (R02)", () => {
    expect(sizeProposals(pair(["-3", "-9", "-9", "-9"]), parameters({ materialType: "raw", procurement: "make" }))).toEqual([]);
    expect(sizeProposals(pair(["-3", "-3", "-3", "-3"]), parameters({ materialType: "raw" }))).toHaveLength(1);
  });

  it("carries a lot's surplus into later days, and proposes again only where the balance would fall below the target", () => {
    // Need 12 on day 0 against 20, lot 15: 23 after. Day 1 is 2 lower (21 ≥ 20), day 2 is 4 lower (19 < 20).
    const proposals = sizeProposals(pair(["8", "6", "4", "4"], ["20", "20", "20", "20"]), parameters({ minimumQuantity: q("10"), lotMultiple: q("5") }));
    expect(proposals.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([
      ["2026-10-01", q("15")],
      ["2026-10-03", q("10")],
    ]);
  });

  it("measures each day against its own target, so a rise proposes on the day it takes effect", () => {
    const proposals = sizeProposals(pair(["10", "10", "10", "10"], ["10", "10", "25", "25"]), parameters());
    expect(proposals.map(({ needDate, quantity }) => [needDate, quantity])).toEqual([["2026-10-03", q("15")]]);
  });

  it("proposes for a balance below zero with no target, and nothing for a balance exactly at the target", () => {
    expect(sizeProposals(pair(["0", "-0.5", "-0.5", "-0.5"]), parameters({ lotMultiple: q("0.000001") })).map(({ quantity }) => quantity)).toEqual([q("0.5")]);
    expect(sizeProposals(pair(["0", "10", "10", "10"], ["0", "10", "10", "10"]), parameters())).toEqual([]);
  });
});
