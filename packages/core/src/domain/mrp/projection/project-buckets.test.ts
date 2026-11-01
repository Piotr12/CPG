import { describe, expect, it } from "vitest";
import { dependableBalance, emptyFlows, lowestDependableBalances, projectBuckets } from "./project-buckets";

describe("MRP bucket projection", () => {
  it("starts a day with every flow at zero", () => {
    expect(emptyFlows("2026-10-01")).toEqual({
      date: "2026-10-01",
      firmDemand: 0n,
      forecastDemand: 0n,
      dependentDemand: 0n,
      transferOut: 0n,
      tentativeSupply: 0n,
      dependableSupply: 0n,
      atRiskSupply: 0n,
      transferIn: 0n,
      proposedReceipts: 0n,
      safetyTarget: 0n,
    });
  });

  it("adds receipts, subtracts demand, never counts at-risk supply and keeps the flows it was given", () => {
    const day = {
      ...emptyFlows("2026-10-01"),
      tentativeSupply: 1n,
      dependableSupply: 2n,
      transferIn: 4n,
      firmDemand: 8n,
      forecastDemand: 16n,
      dependentDemand: 32n,
      transferOut: 64n,
      atRiskSupply: 1000n,
      safetyTarget: 500n,
    };
    const [bucket] = projectBuckets(100n, [day]);
    expect(bucket).toEqual({ ...day, projectedBefore: -13n, projectedAfter: -13n, shortage: 13n });
  });

  it("carries the balance from day to day and adds every proposed receipt so far after proposals", () => {
    const buckets = projectBuckets(10n, [
      { ...emptyFlows("2026-10-01"), firmDemand: 25n },
      { ...emptyFlows("2026-10-02"), proposedReceipts: 20n },
      { ...emptyFlows("2026-10-03"), proposedReceipts: 5n, dependableSupply: 15n },
    ]);
    expect(buckets.map(({ projectedBefore, projectedAfter, shortage }) => [projectedBefore, projectedAfter, shortage])).toEqual([
      [-15n, -15n, 15n],
      [-15n, 5n, 15n],
      [0n, 25n, 0n],
    ]);
  });

  it("shows no shortage at zero or above", () => {
    const buckets = projectBuckets(5n, [{ ...emptyFlows("2026-10-01"), firmDemand: 5n }, emptyFlows("2026-10-02")]);
    expect(buckets.map(({ projectedBefore, shortage }) => [projectedBefore, shortage])).toEqual([
      [0n, 0n],
      [0n, 0n],
    ]);
  });

  it("dependableBalance: equals projectedBefore without tentative supply, and leaves tentative supply out otherwise (#277)", () => {
    const flows = ["2026-10-01", "2026-10-02", "2026-10-03"].map(emptyFlows);
    Object.assign(flows[0], { dependableSupply: 5n, transferIn: 3n, firmDemand: 1n, forecastDemand: 1n, dependentDemand: 1n, transferOut: 1n, atRiskSupply: 50n, proposedReceipts: 50n });
    Object.assign(flows[1], { firmDemand: 20n });
    Object.assign(flows[2], { dependableSupply: 7n });
    const buckets = projectBuckets(10n, flows);
    expect([0, 1, 2].map((day) => dependableBalance({ physical: 10n, flows }, day))).toEqual(buckets.map(({ projectedBefore }) => projectedBefore));
    expect([0, 1, 2].map((day) => dependableBalance({ physical: 10n, flows }, day))).toEqual([14n, -6n, 1n]);
    flows[1].tentativeSupply = 100n;
    expect(dependableBalance({ physical: 10n, flows }, 2)).toBe(1n);
    expect(projectBuckets(10n, flows)[2].projectedBefore).toBe(101n);
  });

  describe("lowestDependableBalances (#282 spec Q1, Q4)", () => {
    // Balances by day: 10, 4 (an order of 6), 9 (a purchase order of 5), 1 (an order of 8), 1.
    const ledger = () => {
      const flows = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map(emptyFlows);
      Object.assign(flows[1], { firmDemand: 6n });
      Object.assign(flows[2], { dependableSupply: 5n });
      Object.assign(flows[3], { firmDemand: 8n });
      return { physical: 10n, flows };
    };
    const none = [0n, 0n, 0n, 0n, 0n];

    it("is the lowest balance from each day on, never an earlier day's", () => {
      expect(lowestDependableBalances(ledger(), none)).toEqual([1n, 1n, 1n, 1n, 1n]);
      expect(lowestDependableBalances(ledger(), none)[0]).toBe(1n);
      expect(lowestDependableBalances(ledger(), none)[2]).toBe(1n);
      // From day 1 the later order of 8 still counts: 4 is on day 1, but 1 is lower afterwards.
      const early = ledger();
      early.flows[3].firmDemand = 0n;
      expect(lowestDependableBalances(early, none)[2]).toBe(9n);
      expect(lowestDependableBalances(early, none)[1]).toBe(4n);
    });

    it("never counts tentative supply or proposed receipts", () => {
      const counted = ledger();
      Object.assign(counted.flows[3], { tentativeSupply: 50n, proposedReceipts: 50n });
      expect(lowestDependableBalances(counted, none)[0]).toBe(1n);
    });

    it("adds the excluded provisional demand back on its days, and may be negative", () => {
      const provisional = ledger();
      provisional.flows[1].dependentDemand = 20n;
      expect(lowestDependableBalances(provisional, none)[0]).toBe(-19n);
      expect(lowestDependableBalances(provisional, [0n, 20n, 0n, 0n, 0n])[0]).toBe(1n);
    });

    it("equals the last day's dependable balance when the balance only falls", () => {
      const falling = ledger();
      falling.flows[2].dependableSupply = 0n;
      expect(lowestDependableBalances(falling, none)[0]).toBe(dependableBalance(falling, 4));
    });
  });
});
