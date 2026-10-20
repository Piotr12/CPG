import { describe, expect, it } from "vitest";
import { previewToken } from "./preview-token";

const content = {
  generation: 1,
  rows: [{ sheet: "Materials", row: 2, values: { id: null, type: "raw" } }],
  outcomes: [{ action: "create", record: "00000003" }],
  versions: ["Material:00000001@1"],
};

describe("previewToken", () => {
  it("is a stable SHA-256 of the content, whatever the key order", () => {
    const token = previewToken(content);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(previewToken({ versions: content.versions, outcomes: content.outcomes, rows: content.rows, generation: 1 })).toBe(token);
  });

  it("changes with the generation, a cell, an outcome, a created ID or a version (Q7)", () => {
    const token = previewToken(content);
    expect(previewToken({ ...content, generation: 2 })).not.toBe(token);
    expect(previewToken({ ...content, rows: [{ sheet: "Materials", row: 2, values: { id: null, type: "finished" } }] })).not.toBe(token);
    expect(previewToken({ ...content, outcomes: [{ action: "update", record: "00000003" }] })).not.toBe(token);
    expect(previewToken({ ...content, outcomes: [{ action: "create", record: "00000004" }] })).not.toBe(token);
    expect(previewToken({ ...content, versions: ["Material:00000001@2"] })).not.toBe(token);
  });
});
