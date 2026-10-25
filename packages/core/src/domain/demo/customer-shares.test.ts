import { describe, expect, it } from "vitest";
import { remainderShare, sharesOf, trendingShare } from "./customer-shares";
import { TEST_TENANT_CONFIG } from "./test-tenant-config.schema";

const { demand } = TEST_TENANT_CONFIG;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe("trendingShare", () => {
  it("moves a share so the customer's volume grows by its quarterly growth while the business grows by its yearly one", () => {
    expect(trendingShare(0.15, 0.1, 0.1, 0)).toBe(0.15);
    for (const quarters of [1, 4, 7.5]) {
      // Volume = share × business size; the business is 1.10^(quarters / 4) of its start.
      const volume = (q: number) => trendingShare(0.15, 0.1, 0.1, q) * 1.1 ** (q / 4);
      expect(volume(quarters + 1) / volume(quarters)).toBeCloseTo(1.1, 12);
      const declining = (q: number) => trendingShare(0.45, -0.015, 0.1, q) * 1.1 ** (q / 4);
      expect(declining(quarters + 1) / declining(quarters)).toBeCloseTo(0.985, 12);
    }
  });
});

describe("sharesOf", () => {
  it("gives a SKU's buyers in the configuration's customer order, the trending ones their share and the remainder split by weight", () => {
    expect(sharesOf(demand, "00000005", 0)).toEqual([
      { customer: "00000001", share: 0.45 },
      { customer: "00000003", share: 0.15 },
      { customer: "00000004", share: expect.closeTo(0.4, 12) },
    ]);
    expect(sharesOf(demand, "00000018", 0)).toEqual([
      { customer: "00000002", share: expect.closeTo(0.85 * 0.6, 12) },
      { customer: "00000003", share: 0.15 },
      { customer: "00000004", share: expect.closeTo(0.85 * 0.4, 12) },
    ]);
  });

  it("sums to 1 for every SKU at every point of the horizon, the remainder customers keeping what the trending ones leave", () => {
    for (const sku of Object.keys((demand.customers[2].trend as { shares: Record<string, string> }).shares)) {
      for (const quarters of [0, 3.25, 8, 12.3]) {
        const shares = sharesOf(demand, sku, quarters);
        expect(sum(shares.map(({ share }) => share))).toBeCloseTo(1, 12);
        const remainder = shares.filter(({ customer }) => customer === "00000002" || customer === "00000004");
        expect(sum(remainder.map(({ share }) => share))).toBeCloseTo(remainderShare(demand, sku, quarters), 12);
      }
    }
  });

  it("shrinks the remainder as the online shop grows: about 0.35 online and 0.28 hardware three years on", () => {
    const later = sharesOf(demand, "00000005", 12);
    expect(later.find(({ customer }) => customer === "00000003")!.share).toBeCloseTo(0.354, 3);
    expect(later.find(({ customer }) => customer === "00000001")!.share).toBeCloseTo(0.282, 3);
    expect(remainderShare(demand, "00000026", 0)).toBeCloseTo(0.85, 12);
  });
});
