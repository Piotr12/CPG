import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  listQueryShape,
  listSortSchema,
  SEARCH_MAX,
  SEARCH_TOO_LONG_MESSAGE,
  SEARCH_WORDS_MAX,
  searchSchema,
  SORT_DIR_MESSAGE,
  SORT_KEY_MESSAGE,
} from "./list-query.schema";

const message = (result: { error?: { issues: { message: string }[] } }) => result.error?.issues[0]?.message;

describe("searchSchema", () => {
  it("trims the search, and reads a missing or blank one as no search", () => {
    expect(searchSchema.parse("  steel sheet ")).toBe("steel sheet");
    expect(searchSchema.parse(undefined)).toBe("");
    expect(searchSchema.parse("   ")).toBe("");
  });

  it("accepts the longest search", () => {
    expect(searchSchema.parse("x".repeat(SEARCH_MAX))).toHaveLength(SEARCH_MAX);
    expect(searchSchema.parse(Array(SEARCH_WORDS_MAX).fill("a").join(" "))).toBe("a a a a a");
  });

  it("refuses too many characters or too many words with one message", () => {
    expect(message(searchSchema.safeParse("x".repeat(SEARCH_MAX + 1)))).toBe(SEARCH_TOO_LONG_MESSAGE);
    expect(message(searchSchema.safeParse(Array(SEARCH_WORDS_MAX + 1).fill("a").join(" ")))).toBe(SEARCH_TOO_LONG_MESSAGE);
  });
});

describe("listSortSchema", () => {
  const schema = listSortSchema(["id", "description"] as const);

  it("accepts an allow-listed key and either direction", () => {
    expect(schema.parse({ sort: "description", dir: "desc" })).toEqual({ sort: "description", dir: "desc" });
    expect(schema.parse({ sort: "id", dir: "asc" })).toEqual({ sort: "id", dir: "asc" });
  });

  it("falls back to the first key ascending for a missing or unknown sort", () => {
    expect(schema.parse({})).toEqual({ sort: "id", dir: "asc" });
    expect(schema.parse({ sort: "uuid", dir: "sideways" })).toEqual({ sort: "id", dir: "asc" });
  });

  it("falls back to a list's own default order", () => {
    const newestFirst = listSortSchema(["id", "date"] as const, { sort: "date", dir: "desc" });
    expect(newestFirst.parse({ sort: ["id", "date"] })).toEqual({ sort: "date", dir: "desc" });
  });
});

describe("listQueryShape", () => {
  const schema = z.object(listQueryShape(["id", "description"] as const));
  const fieldMessages = (input: unknown) => z.flattenError(schema.safeParse(input).error!).fieldErrors;

  it("leaves a missing sort and direction to the service's default order, and a missing search blank", () => {
    expect(schema.parse({})).toEqual({ q: "" });
  });

  it("accepts an allow-listed key, either direction and a search", () => {
    expect(schema.parse({ q: " steel ", sort: "description", dir: "desc" })).toEqual({ q: "steel", sort: "description", dir: "desc" });
    expect(schema.parse({ dir: "asc" })).toEqual({ q: "", dir: "asc" });
  });

  it("refuses an unknown sort or direction with a fixed message on that field, rather than falling back", () => {
    expect(fieldMessages({ sort: "uuid" })).toEqual({ sort: [SORT_KEY_MESSAGE] });
    expect(fieldMessages({ dir: "sideways" })).toEqual({ dir: [SORT_DIR_MESSAGE] });
    expect(fieldMessages({ sort: "" })).toEqual({ sort: [SORT_KEY_MESSAGE] });
  });

  it("refuses a search past the limits on the search field", () => {
    expect(fieldMessages({ q: Array(SEARCH_WORDS_MAX + 1).fill("a").join(" ") })).toEqual({ q: [SEARCH_TOO_LONG_MESSAGE] });
  });
});
