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
});
