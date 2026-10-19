import type { HelpTopic } from "./topics";

/** Longer queries are cut, not refused: no topic needs more words than this to find. */
export const HELP_QUERY_MAX_LENGTH = 100;

/** Lowercase, without diacritics. `ł` has no decomposition, so it is mapped by hand. */
export function foldForSearch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
}

/** The query as the search uses it: trimmed and capped at `HELP_QUERY_MAX_LENGTH` characters. */
export function cleanHelpQuery(query: string | string[] | undefined): string {
  const first = Array.isArray(query) ? query[0] : query;
  return (first ?? "").trim().slice(0, HELP_QUERY_MAX_LENGTH);
}

/** Topics whose title or text contains every word of the query; an empty query matches all of them. */
export function searchHelp(topics: HelpTopic[], query: string): HelpTopic[] {
  const terms = foldForSearch(query).split(/\s+/).filter(Boolean);
  return topics.filter((topic) => {
    const text = foldForSearch([topic.title, ...topic.body].join(" "));
    return terms.every((term) => text.includes(term));
  });
}
