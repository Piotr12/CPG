import { describe, expect, it } from "vitest";
import { cleanHelpQuery, foldForSearch, HELP_QUERY_MAX_LENGTH, searchHelp } from "./search-help";
import { helpTopics, type HelpTopic } from "./topics";

const topic = (id: string, title: string, ...body: string[]) => ({ id, route: "/", title, body }) as unknown as HelpTopic;
const ids = (topics: HelpTopic[]) => topics.map(({ id }) => id);

describe("foldForSearch", () => {
  it("ignores case and diacritics, including ł, which doesn't decompose", () => {
    expect(foldForSearch("Łatwo ZAŻÓŁĆ gęślą jaźń")).toBe("latwo zazolc gesla jazn");
  });
});

describe("cleanHelpQuery", () => {
  it.each([
    [undefined, ""],
    ["  sign in  ", "sign in"],
    [["first", "second"], "first"],
  ])("reads %j as %j", (raw, query) => {
    expect(cleanHelpQuery(raw)).toBe(query);
  });

  it("cuts an over-long query instead of refusing it", () => {
    expect(cleanHelpQuery("x".repeat(500))).toHaveLength(HELP_QUERY_MAX_LENGTH);
    expect(HELP_QUERY_MAX_LENGTH).toBe(100);
  });
});

describe("searchHelp", () => {
  const topics = [topic("a", "Signing in", "Enter your password."), topic("b", "Łatwy start", "Zaloguj się.")];

  it("lists everything for an empty query", () => {
    expect(ids(searchHelp(topics, ""))).toEqual(["a", "b"]);
    expect(ids(searchHelp(topics, "   "))).toEqual(["a", "b"]);
  });

  it("matches the title or the text, ignoring case", () => {
    expect(ids(searchHelp(topics, "SIGNING"))).toEqual(["a"]);
    expect(ids(searchHelp(topics, "password"))).toEqual(["a"]);
  });

  it("finds Polish words with or without diacritics", () => {
    expect(ids(searchHelp(topics, "latwy"))).toEqual(["b"]);
    expect(ids(searchHelp(topics, "łatwy ZALOGUJ"))).toEqual(["b"]);
  });

  it("needs every word to match", () => {
    expect(ids(searchHelp(topics, "signing zaloguj"))).toEqual([]);
  });

  it("finds the real sign-in topic in both languages (UX-013)", () => {
    expect(ids(searchHelp(helpTopics("en"), "sign"))).toContain("signing-in");
    expect(ids(searchHelp(helpTopics("pl"), "logowanie"))).toContain("signing-in");
  });

  it("finds the production order topic, with its completion example, for “completion” in both languages (UX-013)", () => {
    const topic = searchHelp(helpTopics("en"), "completion").find(({ id }) => id === "production-order-detail");
    expect(topic?.body.join(" ")).toContain("Posting a completion: choose Post completion");
    expect(topic?.body.join(" ")).toContain("0.5 kg per bar × 4 bars = 2 kg");
    expect(ids(searchHelp(helpTopics("pl"), "wykonanie"))).toContain("production-order-detail");
  });
});
