import type { TestTenantConfig } from "./test-tenant-config.schema";

/*
 * How a SKU's daily demand is split over its buyers (spec "Customers"): a trending customer's share
 * moves by its quarterly growth relative to the business's, and the remainder customers split what is
 * left by fixed weights. The demand model works in floating point; what it hands on is whole units.
 */

type Demand = TestTenantConfig["demand"];

/** One buyer of a SKU and its share of the SKU's demand. */
export interface BuyerShare {
  customer: string;
  share: number;
}

/**
 * A trending customer's share after `quarters` quarters since the history start: its starting share
 * × ((1 + its quarterly growth) / (1 + the business's yearly growth)^¼)^quarters, so its volume grows
 * by exactly its quarterly growth while the business grows by its yearly one.
 */
export function trendingShare(start: number, quarterlyGrowth: number, growthPerYear: number, quarters: number): number {
  return start * ((1 + quarterlyGrowth) / (1 + growthPerYear) ** 0.25) ** quarters;
}

/** The trending customers' shares of `product`, by customer. */
function trendingShares(demand: Demand, product: string, quarters: number): Map<string, number> {
  const shares = new Map<string, number>();
  for (const { customer, trend } of demand.customers) {
    if ("shares" in trend && product in trend.shares) {
      shares.set(customer, trendingShare(Number(trend.shares[product]), Number(trend.quarterlyGrowth), Number(demand.growthPerYear), quarters));
    }
  }
  return shares;
}

/** What the trending customers leave of `product` for the remainder customers, after `quarters` quarters. */
export function remainderShare(demand: Demand, product: string, quarters: number): number {
  return 1 - [...trendingShares(demand, product, quarters).values()].reduce((sum, share) => sum + share, 0);
}

/** Every buyer of `product` in the configuration's customer order, with its share after `quarters` quarters: they sum to 1. */
export function sharesOf(demand: Demand, product: string, quarters: number): BuyerShare[] {
  const trending = trendingShares(demand, product, quarters);
  const remainder = remainderShare(demand, product, quarters);
  return demand.customers.flatMap(({ customer, trend }): BuyerShare[] => {
    if ("shares" in trend) return trending.has(customer) ? [{ customer, share: trending.get(customer)! }] : [];
    return product in trend.remainderWeights ? [{ customer, share: remainder * Number(trend.remainderWeights[product]) }] : [];
  });
}
