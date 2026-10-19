import { describe, expect, it } from "vitest";
import { revokeApiTokenSchema } from "./revoke-api-token.schema";

describe("revokeApiTokenSchema", () => {
  it("takes a token id", () => {
    const tokenId = "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f";
    expect(revokeApiTokenSchema.parse({ tokenId })).toEqual({ tokenId });
  });

  it("rejects anything that isn't a UUID", () => {
    expect(revokeApiTokenSchema.safeParse({ tokenId: "x" }).success).toBe(false);
  });
});
