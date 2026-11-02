import { describe, expect, it } from "vitest";
import { planExcess, type ExcessDay } from "./plan-excess";

const M = 1_000_000n;
const day = (projectedBefore: bigint, flows: Partial<Omit<ExcessDay, "projectedBefore">> = {}): ExcessDay => ({
  tentativeSupply: 0n,
  dependableSupply: 0n,
  transferIn: 0n,
  safetyTarget: 0n,
  projectedBefore,
  ...flows,
});

describe("planExcess", () => {
  it("is the last day's surplus when the open supply covers it (RUN-010: an order of 100, demand of 80)", () => {
    expect(planExcess([day(0n), day(100n * M, { dependableSupply: 100n * M }), day(20n * M)])).toBe(20n * M);
  });

  it("is capped at the open supply, so surplus physical stock alone is never excess", () => {
    // Stock of 200, an order of 100, demand of 80: the whole order is unneeded, the stock isn't excess.
    expect(planExcess([day(200n * M), day(300n * M, { dependableSupply: 100n * M }), day(220n * M)])).toBe(100n * M);
    expect(planExcess([day(200n * M), day(120n * M)])).toBe(0n);
  });

  it("counts requisitions, transfer receipts and overdue supply on today's day as open supply", () => {
    expect(planExcess([day(30n * M, { tentativeSupply: 5n * M, transferIn: 3n * M }), day(30n * M)])).toBe(8n * M);
    expect(planExcess([day(7_000_001n, { tentativeSupply: 7_000_001n }), day(7_000_001n)])).toBe(7_000_001n);
  });

  it("measures the surplus above the last day's safety target, not an earlier day's", () => {
    expect(planExcess([day(30n * M, { dependableSupply: 100n * M, safetyTarget: 50n * M }), day(30n * M, { safetyTarget: 10n * M })])).toBe(20n * M);
    expect(planExcess([day(30n * M, { dependableSupply: 100n * M }), day(30n * M, { safetyTarget: 30n * M })])).toBe(0n);
  });

  it("is zero when the last day ends short, whatever arrived", () => {
    expect(planExcess([day(100n * M, { dependableSupply: 100n * M }), day(-20n * M)])).toBe(0n);
  });

  it("ignores at-risk supply, which no balance counts", () => {
    const atRisk = { ...day(10n * M), atRiskSupply: 50n * M } as ExcessDay;
    expect(planExcess([atRisk, day(10n * M)])).toBe(0n);
  });

  it("reads a one-day plan", () => {
    expect(planExcess([day(4n * M, { dependableSupply: 4n * M })])).toBe(4n * M);
  });
});
