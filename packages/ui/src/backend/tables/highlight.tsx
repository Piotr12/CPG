import { Fragment, type ReactNode } from "react";

/** The words of a search as the server splits them: at whitespace and at `%`, `_` and `\`. */
export function highlightWords(query: string | undefined): string[] {
  return [...new Set((query ?? "").toLowerCase().split(/[\s%_\\]+/).filter(Boolean))];
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `text` with every word of `query` marked, ignoring case (#217). The mark is the neutral `highlight`
 * token plus weight, never a hue: colour means state, and amber already means the Test tenant.
 */
export function Highlight({ text, query }: { text: string; query?: string }): ReactNode {
  const words = highlightWords(query);
  if (words.length === 0) return text;
  // Longest first, so "steel" is marked whole rather than its "st".
  const pattern = new RegExp(`(${words.sort((a, b) => b.length - a.length).map(escape).join("|")})`, "gi");
  return text
    .split(pattern)
    .map((part, index) =>
      index % 2 === 1 ? (
        <mark key={index} className="rounded-sm bg-highlight font-semibold text-foreground">
          {part}
        </mark>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}
