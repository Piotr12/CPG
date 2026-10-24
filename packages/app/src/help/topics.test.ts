import { describe, expect, it } from "vitest";
import { HELP_TOPIC_IDS, HELP_TOPIC_ROUTES, helpTopics } from "./topics";

describe("help topics", () => {
  it.each(["en", "pl"] as const)("lists every topic in %s, in order, with its screen", (locale) => {
    const topics = helpTopics(locale);

    expect(topics.map(({ id }) => id)).toEqual([...HELP_TOPIC_IDS]);
    for (const topic of topics) {
      expect(topic.route).toBe(HELP_TOPIC_ROUTES[topic.id]);
      expect(topic.title).not.toBe("");
      expect(topic.body.length).toBeGreaterThan(0);
    }
  });

  it("is written separately in Polish, not copied from English", () => {
    const english = helpTopics("en");
    const polish = helpTopics("pl");

    polish.forEach((topic, i) => {
      expect(topic.title).not.toBe(english[i].title);
      expect(topic.body).toHaveLength(english[i].body.length);
    });
  });

  it.each(["en", "pl"] as const)("describes the sidebar, its TEST | PROD switch and the rail shortcut in %s, not the retired top menu or strip", (locale) => {
    const text = (id: string) => helpTopics(locale).find((topic) => topic.id === id)!.body.join(" ");

    expect(text("getting-started")).toContain("Ctrl+B");
    expect(text("test-and-prod")).toContain("TEST | PROD");
    const everything = helpTopics(locale).flatMap((topic) => topic.body).join(" ");
    expect(everything).not.toMatch(/strip|menu at the top|Pasek u góry|Menu u góry/);
  });

  it.each([
    ["en", "listed as revoked too", "without an entry here"],
    ["pl", "zapisany jako unieważniony", "bez wpisu w tym audycie"],
  ] as const)("says in %s which ended tokens the Global audit lists and which it doesn't", (locale, listed, unlisted) => {
    const text = helpTopics(locale).find((topic) => topic.id === "global-audit")!.body.join(" ");

    expect(text).toContain(listed);
    expect(text).toContain(unlisted);
  });

  it.each([
    ["en", "filter by record type and ID", "business date under the audit time", "Reversed by"],
    ["pl", "filtruj według rodzaju i ID rekordu", "datę księgowania", "Odwrócony przez"],
  ] as const)("explains in %s how to trace a record's history (E13-S03)", (locale, filters, businessDate, reversal) => {
    const text = (id: string) => helpTopics(locale).find((topic) => topic.id === id)!.body.join(" ");

    expect(text("global-audit")).toContain(filters);
    expect(text("tenant-audit")).toContain(filters);
    expect(text("tenant-audit")).toContain(businessDate);
    expect(text("tenant-audit")).toContain(reversal);
  });

  it.each([
    ["en", /recipe/i],
    ["pl", /receptur/i],
  ] as const)("says BOM, never recipe, in %s (one term per concept, design system v1 Principle 7; #206)", (locale, recipe) => {
    const offenders = helpTopics(locale).flatMap((topic) => [topic.title, ...topic.body]).filter((text) => recipe.test(text));

    expect(offenders).toEqual([]);
  });
});
