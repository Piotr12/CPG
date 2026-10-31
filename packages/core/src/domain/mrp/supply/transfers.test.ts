import { describe, expect, it } from "vitest";
import { parseDecimal } from "../../quantities/decimal";
import type { MrpTransfer } from "../mrp-inputs";
import { horizonDates } from "../projection/horizon";
import { pairKey } from "../projection/pairs";
import { emptyFlows, type MrpLedger } from "../projection/project-buckets";
import { planTransfers } from "./transfers";

const q = (text: string) => parseDecimal(text)!;
const DATES = horizonDates("2026-10-01");

const transfer = (overrides: Partial<MrpTransfer>): MrpTransfer => ({
  transfer: "00000001",
  material: "M1",
  source: "S",
  destination: "D",
  plannedDispatch: "2026-10-05",
  plannedArrival: "2026-10-06",
  quantity: q("40"),
  dispatched: 0n,
  received: 0n,
  writtenOff: 0n,
  abandoned: 0n,
  status: "open",
  ...overrides,
});

/** Ledgers created on first use, as `planMrp`'s pairs are. */
function ledgers(physical: Record<string, bigint> = {}) {
  const made = new Map<string, MrpLedger>();
  const ledgerOf = (material: string, location: string) => {
    const key = pairKey(material, location);
    if (!made.has(key)) made.set(key, { physical: physical[location] ?? 0n, flows: DATES.map(emptyFlows) });
    return made.get(key)!;
  };
  return { made, ledgerOf };
}

describe("planTransfers", () => {
  it("checks the source's dependable balance, so a requisition there never makes a dispatch feasible (Q2)", () => {
    const { ledgerOf } = ledgers({ S: q("10") });
    ledgerOf("M1", "S").flows[2].tentativeSupply = q("100");

    const plan = planTransfers([transfer({})], DATES, ledgerOf);

    expect(plan.dispatches.map(({ quantity }) => quantity)).toEqual([q("10")]);
    expect(plan.exceptions).toEqual([expect.objectContaining({ planned: q("40"), available: q("10") })]);
  });

  it("writes each feasible leg into the ledgers itself, once", () => {
    const { made, ledgerOf } = ledgers({ S: q("100") });

    const plan = planTransfers([transfer({ dispatched: q("15") })], DATES, ledgerOf);

    const source = made.get(pairKey("M1", "S"))!;
    const destination = made.get(pairKey("M1", "D"))!;
    expect(source.flows[4].transferOut).toBe(q("25"));
    expect(destination.flows[5].transferIn).toBe(q("40"));
    expect(plan.receipts.map(({ stage, quantity }) => [stage, quantity])).toEqual([
      ["in-transit", q("15")],
      ["planned", q("25")],
    ]);
  });

  it("plans no ledger for a transfer with nothing left to dispatch and nothing in transit", () => {
    const { made, ledgerOf } = ledgers();

    const plan = planTransfers([transfer({ dispatched: q("40"), received: q("30"), writtenOff: q("10") })], DATES, ledgerOf);

    expect(plan).toEqual({ dispatches: [], receipts: [], exceptions: [] });
    expect(made.size).toBe(0);
  });
});
