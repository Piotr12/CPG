import { describe, expect, it } from "vitest";
import { tokenCreatedEntry, tokenRevokedEntry } from "./api-token-audit";

const TOKEN = { id: "3f0c1e2a-6b7d-4c8e-9f10-1a2b3c4d5e6f", name: "build" };

describe("API token audit entries", () => {
  it("records a creation with the name after, and nothing before", () => {
    expect(tokenCreatedEntry(TOKEN)).toEqual({
      action: "tokens.api-token.created",
      subject: { type: "ApiToken", id: TOKEN.id, label: "build" },
      before: null,
      after: { name: "build" },
    });
  });

  it("records a revocation with the name before, and nothing after", () => {
    expect(tokenRevokedEntry(TOKEN)).toEqual({
      action: "tokens.api-token.revoked",
      subject: { type: "ApiToken", id: TOKEN.id, label: "build" },
      before: { name: "build" },
      after: null,
    });
  });

  it("copies only the id and name, whatever else the token carries (AUD-028)", () => {
    const token = { ...TOKEN, tokenHash: "f".repeat(64), lastUsedAt: new Date() };

    const entries = [tokenCreatedEntry(token), tokenRevokedEntry(token)];

    expect(JSON.stringify(entries)).not.toContain("f".repeat(64));
    expect(entries.flatMap(({ before, after }) => Object.keys({ ...before, ...after }))).toEqual(["name", "name"]);
  });
});
