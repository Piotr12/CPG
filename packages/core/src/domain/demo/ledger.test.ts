import { describe, expect, it } from "vitest";
import { ONE } from "../quantities/decimal";
import { Ledger } from "./ledger";
import { TEST_TENANT_CONFIG } from "./test-tenant-config.schema";

describe("Ledger", () => {
  it("posts openings, receipts, completions and issues in base units, finding each through the document it names", () => {
    const ledger = new Ledger(TEST_TENANT_CONFIG);
    expect(ledger.balance("00000001", "00000001")).toBe(0n);
    expect(
      ledger.apply({
        kind: "opening",
        location: "00000001",
        lines: [
          { material: "00000001", quantity: "2", unit: "t" },
          { material: "00000005", quantity: "0", unit: "each" },
        ],
      }),
    ).toEqual([{ material: "00000001", location: "00000001", quantity: 2000n * ONE }]);

    expect(ledger.apply({ kind: "requisition", key: "r", material: "00000002", location: "00000001", quantity: "5", unit: "case", requiredDate: "2026-11-02" })).toEqual([]);
    ledger.apply({ kind: "purchaseOrder", key: "po", supplier: "00000002", location: "00000001", lines: [{ material: "00000002", quantity: "5", unit: "case", plannedDate: "2026-10-02", requisition: "r" }] });
    expect(ledger.apply({ kind: "goodsReceipt", order: "po", lines: [{ line: 1, quantity: "5", unit: "case" }] })).toEqual([{ material: "00000002", location: "00000001", quantity: 60n * ONE }]);

    ledger.apply({ kind: "productionOrder", key: "mo", output: "00000004", location: "00000001", quantity: "10", unit: "each", plannedFinish: "2026-10-06", bom: "00000001", revision: 1 });
    expect(
      ledger.apply({
        kind: "completion",
        order: "mo",
        quantity: "10",
        unit: "each",
        components: [
          { material: "00000001", quantity: "45", unit: "kg" },
          { material: "00000003", quantity: "0", unit: "l" },
        ],
      }),
    ).toEqual([
      { material: "00000004", location: "00000001", quantity: 10n * ONE },
      { material: "00000001", location: "00000001", quantity: -45n * ONE },
    ]);

    ledger.apply({ kind: "customerOrder", key: "co", customer: "00000002", location: "00000001", lines: [{ material: "00000004", quantity: "4", unit: "each", requiredDate: "2026-10-20" }] });
    ledger.apply({ kind: "shipment", key: "sh", order: "co", plannedDate: "2026-10-20", lines: [{ orderLine: 0, quantity: "4", unit: "each" }] });
    expect(ledger.apply({ kind: "goodsIssue", shipment: "sh", lines: [{ line: 1, quantity: "4", unit: "each" }] })).toEqual([{ material: "00000004", location: "00000001", quantity: -4n * ONE }]);

    expect([ledger.balance("00000001", "00000001"), ledger.balance("00000002", "00000001"), ledger.balance("00000004", "00000001")]).toEqual([1955n * ONE, 60n * ONE, 6n * ONE]);
  });
});
