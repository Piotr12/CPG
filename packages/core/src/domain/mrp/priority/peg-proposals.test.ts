import { describe, expect, it } from "vitest";
import { addDays } from "../../demand/demand-buckets";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpDemandRoot, MrpDemandShare, MrpFirmDemand, MrpForecastDemand, MrpPlannedComponentDemand } from "../mrp-result";
import { emptyFlows } from "../projection/project-buckets";
import { pegProposals, type PeggedPair, type PeggedProposal } from "./peg-proposals";

const TODAY = "2026-10-05";
const q = (text: string) => parseDecimal(text)!;
const day = (offset: number) => addDays(TODAY, offset);

const order = (offset: number, quantity: string, code = "O1"): MrpFirmDemand => ({
  order: code,
  position: 1,
  material: "F",
  location: "L1",
  requiredDate: day(offset),
  date: day(offset),
  quantity: q(quantity),
});
const forecast = (offset: number, quantity: string): MrpForecastDemand => ({
  material: "F",
  location: "L1",
  forecastDate: day(offset),
  date: day(offset),
  forecastQuantity: q(quantity),
  quantity: q(quantity),
});
/** The root of the pair's own order line, forecast or target, as the trace names it. */
const orderRoot = (offset: number, code = "O1", material = "F"): MrpDemandRoot => ({ kind: "customer-order", material, originalDate: day(offset), document: code, position: 1 });
const forecastRoot = (offset: number): MrpDemandRoot => ({ kind: "forecast", material: "F", originalDate: day(offset), document: null, position: null });
const targetRoot = (offset: number): MrpDemandRoot => ({ kind: "safety-target", material: "F", originalDate: day(offset), document: null, position: null });
const share = (root: MrpDemandRoot, quantity: string): MrpDemandShare => ({ root, quantity: q(quantity) });

/** A need of F on day `offset` from a parent G's proposal, by root share. */
const planned = (offset: number, shares: MrpDemandShare[], { parentNeed = offset + 2, provisional = false } = {}): MrpPlannedComponentDemand => ({
  parent: "G",
  parentNeedDate: day(parentNeed),
  bom: "00000001",
  bomRevision: 1,
  material: "F",
  location: "L1",
  date: day(offset),
  quantity: shares.reduce((sum, { quantity }) => sum + quantity, 0n),
  roots: shares,
  provisional,
});

type Supply = { dependable?: string; atRisk?: string };

/** F at L1 over ten days from TODAY; `supply` by day offset. */
const pair = (physical: string, lists: Partial<Pick<PeggedPair, "firmDemand" | "forecastDemand" | "plannedComponentDemand">>, supply: Record<number, Supply> = {}): PeggedPair => ({
  material: "F",
  physical: q(physical),
  buckets: Array.from({ length: 10 }, (_, offset) => ({
    ...emptyFlows(day(offset)),
    dependableSupply: q(supply[offset]?.dependable ?? "0"),
    atRiskSupply: q(supply[offset]?.atRisk ?? "0"),
  })),
  firmDemand: [],
  forecastDemand: [],
  componentDemand: [],
  plannedComponentDemand: [],
  transfersOut: [],
  ...lists,
});
const proposal = (offset: number, quantity: string): PeggedProposal => ({ needDate: day(offset), quantity: q(quantity) });

/** Every proposal's shares add up to its quantity: the trace labels units, never changes them. */
function expectWhole(shares: MrpDemandShare[][], proposals: PeggedProposal[]) {
  expect(shares.map((list) => list.reduce((sum, { quantity }) => sum + quantity, 0n))).toEqual(proposals.map(({ quantity }) => quantity));
}

describe("pegProposals (#327)", () => {
  it("traces a proposal covering a customer order of 6 and a forecast of 4 on one day to both, the order first", () => {
    const proposals = [proposal(2, "10")];
    const { proposals: shares, provisional } = pegProposals(pair("0", { forecastDemand: [forecast(2, "4")], firmDemand: [order(2, "6")] }), proposals, []);
    expect(shares).toEqual([[share(orderRoot(2), "6"), share(forecastRoot(2), "4")]]);
    expect(provisional).toEqual([]);
  });

  it("lets existing supply serve first: a purchase order of 5 the day before leaves the proposal 1 of the order and the forecast's 4 (Q2)", () => {
    const proposals = [proposal(2, "5")];
    const { proposals: shares } = pegProposals(pair("0", { forecastDemand: [forecast(2, "4")], firmDemand: [order(2, "6")] }, { 1: { dependable: "5" } }), proposals, []);
    expect(shares).toEqual([[share(orderRoot(2), "1"), share(forecastRoot(2), "4")]]);
  });

  it("counts at-risk output as existing supply, so the demand it blocks is never a proposal's root (E17-S03)", () => {
    const { proposals: shares } = pegProposals(pair("0", { forecastDemand: [forecast(2, "4")], firmDemand: [order(2, "6")] }, { 1: { atRisk: "6" } }), [proposal(2, "4")], []);
    expect(shares).toEqual([[share(forecastRoot(2), "4")]]);
  });

  it("roots what no requirement takes, a lot's surplus or a target's top-up, at the pair's target on the proposal's need date (Q3)", () => {
    const { proposals: shares } = pegProposals(pair("0", { firmDemand: [order(2, "6")] }), [proposal(2, "8"), proposal(5, "3")], []);
    expect(shares).toEqual([[share(orderRoot(2), "6"), share(targetRoot(2), "2")], [share(targetRoot(5), "3")]]);
  });

  it("lets the older proposal serve first, and a later requirement take what it left before a newer proposal", () => {
    const proposals = [proposal(5, "2"), proposal(2, "6")];
    const { proposals: shares } = pegProposals(pair("0", { firmDemand: [order(2, "4", "O1"), order(5, "4", "O2")] }), proposals, []);
    // In input order: the day-5 proposal gives O2 its last 2; the day-2 one gives O1 4 and O2 its first 2.
    expect(shares).toEqual([[share(orderRoot(5, "O2"), "2")], [share(orderRoot(2, "O1"), "4"), share(orderRoot(5, "O2"), "2")]]);
    expectWhole(shares, proposals);
  });

  it("carries a parent's roots down: a share of G's order and the pair's own forecast, by the root's priority", () => {
    const fromG = planned(1, [share(orderRoot(3, "OG", "G"), "3"), share({ ...forecastRoot(3), material: "G" }, "1")]);
    const proposals = [proposal(1, "6")];
    const { proposals: shares } = pegProposals(pair("0", { forecastDemand: [forecast(1, "2")], plannedComponentDemand: [fromG] }), proposals, []);
    expect(shares).toEqual([[share(orderRoot(3, "OG", "G"), "3"), share(forecastRoot(1), "2"), share({ ...forecastRoot(3), material: "G" }, "1")]]);
  });

  it("merges two shares of one root, via one parent on two need dates, into one share", () => {
    const root = orderRoot(4, "OG", "G");
    const needs = [planned(1, [share(root, "2")], { parentNeed: 4 }), planned(1, [share(root, "3")], { parentNeed: 5 })];
    expect(pegProposals(pair("0", { plannedComponentDemand: needs }), [proposal(1, "5")], []).proposals).toEqual([[share(root, "5")]]);
  });

  it("traces executable proposals without provisional parents' needs, as sizing sized them (Q5)", () => {
    const provisionalNeed = planned(2, [share(orderRoot(2, "A", "G"), "4")], { provisional: true });
    const { proposals: shares } = pegProposals(pair("0", { firmDemand: [order(2, "6", "B")], plannedComponentDemand: [provisionalNeed] }), [proposal(2, "6")], []);
    expect(shares).toEqual([[share(orderRoot(2, "B"), "6")]]);
  });

  it("roots a provisional proposal at the provisional need it was sized for, even when that need ranks before the pair's own order (spec review)", () => {
    // G's provisional need rooted at order A ranks before F's own order B on one day. One pooled pass would give the
    // executable proposal A's 4 and B's 6, and the provisional one B's last 4.
    const provisionalNeed = planned(5, [share(orderRoot(5, "A", "G"), "4")], { parentNeed: 5, provisional: true });
    const result = pegProposals(pair("0", { firmDemand: [order(5, "10", "B")], plannedComponentDemand: [provisionalNeed] }), [proposal(5, "10")], [proposal(5, "4")]);
    expect(result).toEqual({ proposals: [[share(orderRoot(5, "B"), "10")]], provisional: [[share(orderRoot(5, "A", "G"), "4")]] });
  });

  it("never frees stock pass 1 needs later: 5 on hand serve the pair's day-3 order, so the provisional proposal serves the day-1 provisional need", () => {
    const provisionalNeed = planned(1, [share(orderRoot(3, "A", "G"), "5")], { provisional: true });
    const result = pegProposals(pair("5", { firmDemand: [order(3, "5", "B")], plannedComponentDemand: [provisionalNeed] }), [], [proposal(3, "5")]);
    expect(result).toEqual({ proposals: [], provisional: [[share(orderRoot(3, "A", "G"), "5")]] });
  });

  it("serves provisional needs first from what pass 1 never consumes, and leaves pass 1's shares as they were", () => {
    const provisionalNeed = planned(1, [share(orderRoot(6, "A", "G"), "8")], { parentNeed: 6, provisional: true });
    const lists = { firmDemand: [order(3, "4", "C"), order(4, "9", "B")], plannedComponentDemand: [provisionalNeed] };
    // Pass 1 on 10 on hand: stock serves C's 4 and 6 of B's 9, and the executable proposal B's last 3, with or without pass 2.
    const alone = pegProposals(pair("10", lists), [proposal(4, "3")], []);
    const both = pegProposals(pair("10", lists), [proposal(4, "3")], [proposal(4, "8")]);
    expect(both.proposals).toEqual(alone.proposals);
    expect(both.proposals).toEqual([[share(orderRoot(4, "B"), "3")]]);
    expect(both.provisional).toEqual([[share(orderRoot(6, "A", "G"), "8")]]);
    // On 17 on hand, pass 1 leaves 4 it never consumes, from day 0 on. The provisional need takes them first, so a
    // provisional lot of 6 serves its last 4 and leaves 2 as stock. Ignoring them would root all 6 at A; freeing the
    // 17 of day 1, which pass 1 still needs, would root none.
    const free = pegProposals(pair("17", lists), [], [proposal(4, "6")]);
    expect(free.provisional).toEqual([[share(orderRoot(6, "A", "G"), "4"), share(targetRoot(4), "2")]]);
  });

  it("keeps two forecasts of one date apart by their material: the pair's own and a parent's", () => {
    const fromG = planned(3, [share({ ...forecastRoot(3), material: "G" }, "1")]);
    const { proposals: shares } = pegProposals(pair("0", { forecastDemand: [forecast(3, "2")], plannedComponentDemand: [fromG] }), [proposal(3, "3")], []);
    expect(shares).toEqual([[share(forecastRoot(3), "2"), share({ ...forecastRoot(3), material: "G" }, "1")]]);
  });

  it("lists a proposal's shares by priority, not by the day they were served", () => {
    // Day 2 serves the forecast, day 3 the order: the order's share still comes first.
    const { proposals: shares } = pegProposals(pair("0", { forecastDemand: [forecast(2, "2")], firmDemand: [order(3, "3")] }), [proposal(2, "5")], []);
    expect(shares).toEqual([[share(orderRoot(3), "3"), share(forecastRoot(2), "2")]]);
  });

  it("re-roots an executable lot's surplus to a provisional need it serves, after stock pass 1 never takes (review of #356)", () => {
    // Pass 1: stock 8 serves order B's 3 and keeps 5 to the end; the lot of 10 serves nothing. G's provisional need of 7
    // takes those 5 first, then 2 of the lot, which leave the target's share.
    const provisionalNeed = planned(3, [share(orderRoot(4, "A", "G"), "7")], { parentNeed: 4, provisional: true });
    const lists = { firmDemand: [order(2, "3", "B")], plannedComponentDemand: [provisionalNeed] };
    expect(pegProposals(pair("8", lists), [proposal(2, "10")], []).proposals).toEqual([[share(orderRoot(4, "A", "G"), "2"), share(targetRoot(2), "8")]]);
    // Without stock to spare, the lot's surplus serves the whole need, though the need comes before the lot's day.
    const later = { firmDemand: [order(2, "3", "B"), order(5, "6", "C")], plannedComponentDemand: [planned(1, [share(orderRoot(4, "A", "G"), "4")], { parentNeed: 4, provisional: true })] };
    expect(pegProposals(pair("5", later), [proposal(5, "10")], []).proposals).toEqual([[share(orderRoot(4, "A", "G"), "4"), share(orderRoot(5, "C"), "4"), share(targetRoot(5), "2")]]);
  });

  it("lets an executable proposal's surplus serve a provisional need before a provisional proposal of the same need date", () => {
    // The executable 5 serve order B's 3 and leave 2; G's provisional need of 7 takes those 2, then 5 of the provisional 10.
    const provisionalNeed = planned(3, [share(orderRoot(3, "A", "G"), "7")], { parentNeed: 3, provisional: true });
    const result = pegProposals(pair("0", { firmDemand: [order(3, "3", "B")], plannedComponentDemand: [provisionalNeed] }), [proposal(3, "5")], [proposal(3, "10")]);
    expect(result).toEqual({
      proposals: [[share(orderRoot(3, "A", "G"), "2"), share(orderRoot(3, "B"), "3")]],
      provisional: [[share(orderRoot(3, "A", "G"), "5"), share(targetRoot(3), "5")]],
    });
  });
});

