import { describe, expect, it } from "vitest";
import { isExecutableProposal } from "./executable-proposal";

describe("isExecutableProposal", () => {
  it("accepts a purchase requisition, and not a production order until MRP chooses its BOM (E19-S01 Q1)", () => {
    expect(isExecutableProposal("purchase-requisition")).toBe(true);
    expect(isExecutableProposal("production-order")).toBe(false);
  });
});
