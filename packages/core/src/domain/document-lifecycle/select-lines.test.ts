import { expect, it } from "vitest";
import { selectLifecycleLines } from "./select-lines";

it("uses the whole aggregate or returns selected Open lines without losing their identity", () => {
  const lines = [{ id: 1, status: "completed" }, { id: 2, status: "open" }];
  expect(selectLifecycleLines(lines, undefined, (line) => line.id)).toBe(lines);
  expect(selectLifecycleLines(lines, [2], (line) => line.id)[0]).toBe(lines[1]);
});
it("rejects empty, duplicate, foreign and terminal selections", () => {
  const lines = [{ id: "a", status: "open" }, { id: "b", status: "cancelled" }];
  for (const selection of [[], ["a", "a"], ["foreign"]]) {
    expect(() => selectLifecycleLines(lines, selection, (line) => line.id)).toThrow(expect.objectContaining({ code: "VALIDATION_FAILED" }));
  }
  expect(() => selectLifecycleLines(lines, ["b"], (line) => line.id)).toThrow(expect.objectContaining({ code: "DOCUMENT_NOT_OPEN" }));
});
