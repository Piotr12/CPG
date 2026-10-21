import { formatDecimal } from "../quantities/decimal";
import { Ledger } from "./ledger";
import type { TestTenantConfig } from "./test-tenant-config.schema";
import type { TimelineEvent } from "./timeline";

/** What a dataset holds: documents per kind, opening postings, and the stock movements they post. */
export type DatasetSummary = Record<
  "customerOrders" | "shipments" | "goodsIssues" | "requisitions" | "purchaseOrders" | "goodsReceipts" | "productionOrders" | "completions" | "openings" | "movements",
  number
>;

/** The summary key counting each kind of timeline event. */
const SUMMARY_KEY = {
  opening: "openings",
  customerOrder: "customerOrders",
  shipment: "shipments",
  goodsIssue: "goodsIssues",
  requisition: "requisitions",
  purchaseOrder: "purchaseOrders",
  goodsReceipt: "goodsReceipts",
  productionOrder: "productionOrders",
  completion: "completions",
} as const satisfies Record<TimelineEvent["kind"], keyof DatasetSummary>;

/**
 * Replays a timeline's postings over its opening balances the way the ledger will (R09): it throws,
 * naming the material and location, at the first movement that would take a balance below zero, and
 * naming the limit when the dataset has more documents (every event but the opening postings) or
 * stock movements than the configuration's `limits` allow. Returns the counts per kind.
 */
export function replayTimeline(config: TestTenantConfig, timeline: readonly TimelineEvent[]): DatasetSummary {
  const summary: DatasetSummary = { customerOrders: 0, shipments: 0, goodsIssues: 0, requisitions: 0, purchaseOrders: 0, goodsReceipts: 0, productionOrders: 0, completions: 0, openings: 0, movements: 0 };
  const ledger = new Ledger(config);
  for (const event of timeline) {
    summary[SUMMARY_KEY[event.kind]] += 1;
    const movements = ledger.apply(event);
    summary.movements += movements.length;
    for (const { material, location } of movements) {
      const balance = ledger.balance(material, location);
      if (balance < 0n) {
        throw new Error(`The dataset takes material ${material} at location ${location} below zero (to -${formatDecimal(-balance)}) with the ${event.kind} at ${event.at}.`);
      }
    }
  }
  const documents = timeline.length - summary.openings;
  if (documents > config.limits.documents) throw new Error(`The dataset has ${documents} documents; limits.documents allows ${config.limits.documents}.`);
  if (summary.movements > config.limits.movements) throw new Error(`The dataset posts ${summary.movements} stock movements; limits.movements allows ${config.limits.movements}.`);
  return summary;
}
