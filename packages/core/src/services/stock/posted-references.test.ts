import { describe, expect, it, vi } from "vitest";
import { postedReferences, REFERENCE_BATCH } from "./posted-references";

/** A lookup over `records` (each the ID it references), returning at most `limit` in stored order. */
const lookupOver = (records: readonly string[]) =>
  vi.fn(async (batch: string[], limit: number) => records.filter((id) => batch.includes(id)).slice(0, limit));

describe("postedReferences", () => {
  it("looks nothing up for no IDs", async () => {
    const lookup = lookupOver([]);
    expect(await postedReferences([], lookup)).toEqual(new Set());
    expect(lookup).not.toHaveBeenCalled();
  });

  it("finds an ID whose records sit behind a full result of another ID's, dropping matched IDs from the next lookup", async () => {
    const lookup = lookupOver([...Array.from({ length: REFERENCE_BATCH }, () => "a"), "b"]);
    expect(await postedReferences(["a", "b", "c"], lookup)).toEqual(new Set(["a", "b"]));
    // The second result is short, so it already held every match: no third lookup for "c".
    expect(lookup.mock.calls.map(([batch, limit]) => [batch, limit])).toEqual([
      [["a", "b", "c"], REFERENCE_BATCH], [["b", "c"], REFERENCE_BATCH],
    ]);
  });

  it("stops after one lookup that finds nothing, or nothing of its batch, and never counts an ID outside it", async () => {
    const none = lookupOver([]);
    expect(await postedReferences(["a"], none)).toEqual(new Set());
    expect(none).toHaveBeenCalledOnce();

    const stranger = vi.fn(async () => Array.from({ length: REFERENCE_BATCH }, () => "x"));
    expect(await postedReferences(["a"], stranger)).toEqual(new Set());
    expect(stranger).toHaveBeenCalledOnce();
  });

  it("names at most one batch of IDs per lookup, and stops a batch once every ID is found", async () => {
    const ids = Array.from({ length: REFERENCE_BATCH + 1 }, (_, index) => `id-${index}`);
    const lookup = lookupOver(ids);
    expect(await postedReferences(ids, lookup)).toEqual(new Set(ids));
    expect(lookup.mock.calls.map(([batch]) => batch.length)).toEqual([REFERENCE_BATCH, 1]);
  });
});
