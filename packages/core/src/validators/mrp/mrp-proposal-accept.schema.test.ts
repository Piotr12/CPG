import { describe, expect, it } from "vitest";
import { mrpProposalAcceptActionSchema, mrpProposalAcceptSchema } from "./mrp-proposal-accept.schema";

describe("MRP proposal acceptance input", () => {
  it("takes an empty body or {}, and refuses any field", () => {
    expect(mrpProposalAcceptSchema.parse(null)).toBeNull();
    expect(mrpProposalAcceptSchema.parse({})).toEqual({});
    expect(mrpProposalAcceptSchema.safeParse({ quantity: "5" }).success).toBe(false);
  });

  it("takes the action's run and proposal as strings, leaving their format to the service", () => {
    expect(mrpProposalAcceptActionSchema.parse({ run: "00000004", proposal: "x" })).toEqual({ run: "00000004", proposal: "x" });
    expect(mrpProposalAcceptActionSchema.safeParse({ run: "00000004" }).success).toBe(false);
    expect(mrpProposalAcceptActionSchema.safeParse({ run: "00000004", proposal: "x", extra: 1 }).success).toBe(false);
  });
});
