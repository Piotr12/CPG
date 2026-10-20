import Link from "next/link";
import { Button } from "@cpg/ui/components/button";
import { fill } from "../../i18n/fill";

/** What the page links say, in the reader's language: `page` fills `{page}` and `{pages}`. */
export interface PageLinkLabels {
  pagination: string;
  previous: string;
  next: string;
  page: string;
}

/**
 * Previous/Next links and "Page 2 of 5" under a paged table, or nothing for a single page. `href`
 * builds a page's address, so the links keep the list's other query parameters.
 */
export function PageLinks({ page, pages, href, labels }: { page: number; pages: number; href: (page: number) => string; labels: PageLinkLabels }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={labels.pagination} className="flex flex-wrap items-center justify-end gap-3">
      {page > 1 && (
        <Button asChild variant="outline">
          <Link href={href(page - 1)}>{labels.previous}</Link>
        </Button>
      )}
      <span className="text-sm">{fill(labels.page, { page: String(page), pages: String(pages) })}</span>
      {page < pages && (
        <Button asChild variant="outline">
          <Link href={href(page + 1)}>{labels.next}</Link>
        </Button>
      )}
    </nav>
  );
}
