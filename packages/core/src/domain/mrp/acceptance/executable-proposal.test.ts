import { describe, expect, it } from "vitest";
import { EXECUTABLE_PROPOSAL_KINDS, isExecutableProposal } from "./executable-proposal";

describe("isExecutableProposal", () => {
  it("accepts a purchase requisition, and a production order that carries the BOM MRP chose (#320 Q2)", () => {
    expect(isExecutableProposal({ kind: "purchase-requisition", bom: null, bomRevision: null })).toBe(true);
    expect(isExecutableProposal({ kind: "production-order", bom: "00000003", bomRevision: 2 })).toBe(true);
  });

  it("refuses a production order with no BOM or no revision to pin: a row an image older than E17-S01 wrote", () => {
    expect(isExecutableProposal({ kind: "production-order", bom: null, bomRevision: null })).toBe(false);
    expect(isExecutableProposal({ kind: "production-order", bom: undefined, bomRevision: undefined })).toBe(false);
    expect(isExecutableProposal({ kind: "production-order", bom: "00000003", bomRevision: null })).toBe(false);
  });

  it("names both kinds for the automatic batch's read (E19-S03)", () => {
    expect(EXECUTABLE_PROPOSAL_KINDS).toEqual(["purchase-requisition", "production-order"]);
  });
});
