import Form from "next/form";
import Link from "next/link";
import { SEARCH_TOO_LONG_MESSAGE } from "@cpg/core/validators/lists/list-query.schema";
import { ListSearch, SearchResultLine } from "@cpg/ui/backend/tables/list-search";
import { plural } from "@cpg/ui/lib/plural";
import type { Messages } from "../../i18n/messages/en";
import type { ListLinks, ListSearchState } from "./list-params";

interface ListSearchBarProps {
  links: ListLinks;
  search: ListSearchState;
  /** This list's box: "Search materials", and what it matches. */
  labels: { label: string; hint: string };
  lists: Messages["lists"];
  locale: string;
  /** How many rows the search found (all pages). */
  count: number;
}

/**
 * The search box above a list and, after a search, the line saying how many rows match with the way
 * back to the whole list (#217). Searching and clearing navigate in the app, keeping the sort.
 */
export function ListSearchBar({ links, search, labels, lists, locale, count }: ListSearchBarProps) {
  return (
    <>
      <ListSearch
        label={labels.label}
        hint={labels.hint}
        query={search.typed}
        error={search.error && (search.error === SEARCH_TOO_LONG_MESSAGE ? lists.searchTooLong : search.error)}
        action={links.path}
        keep={links.keep}
        submitLabel={lists.search}
        form={Form}
      />
      {search.q && (
        <SearchResultLine clearHref={links.clearHref} clearLabel={lists.clear} link={Link}>
          {plural(locale, count, lists.results).replaceAll("{query}", search.q)}
        </SearchResultLine>
      )}
    </>
  );
}

/** A searched list's empty state: nothing matched, and the way back to the whole list. */
export function NoSearchResults({ links, query, lists }: { links: ListLinks; query: string; lists: Messages["lists"] }) {
  return (
    <>
      {`${lists.noResults.replaceAll("{query}", query)} `}
      <Link href={links.clearHref} className="underline underline-offset-4">
        {lists.clear}
      </Link>
    </>
  );
}
