import type { ReactNode } from "react";
import Link from "next/link";
import type { AuditPage, AuditReversalLink } from "@cpg/core";
import type { AuditFilterQuery } from "@cpg/core/validators/audit/audit-list.schema";
import type { Messages } from "../../i18n/messages/en";
import { AuditFilters } from "./audit-filters";
import { auditUrl, isFiltered } from "./audit-query";
import { AuditTable } from "./audit-table";
import type { AuditSubjectType } from "./subject-types";

/**
 * One audit screen: heading, an optional back link, what this audit holds, the filter form, the entries
 * and the paging links. Shared by the Global and the tenant audit; each page reads its own entries. The
 * Global audit is in the menu, so only the tenant audit links back (to its tenant home). Paging keeps
 * the filters.
 */
export function AuditView({
  heading,
  back,
  intro,
  page,
  path,
  isFirstPage,
  selected,
  accounts,
  subjectTypes,
  reversals = [],
  labels,
}: {
  heading: string;
  back?: { href: string; label: string };
  intro: ReactNode;
  page: AuditPage;
  /** This screen's path, for the form and the paging and history links. */
  path: string;
  isFirstPage: boolean;
  /** The filters the page was read with. */
  selected: AuditFilterQuery;
  accounts: readonly string[];
  subjectTypes: readonly AuditSubjectType[];
  /** The reversal links of the page's stock movements (tenant audit only). */
  reversals?: readonly AuditReversalLink[];
  labels: Messages["audit"];
}) {
  const filtered = isFiltered(selected);
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        {back && (
          <Link href={back.href} className="text-sm font-medium underline underline-offset-4">
            {back.label}
          </Link>
        )}
      </div>
      <div className="text-sm text-muted-foreground">{intro}</div>
      <AuditFilters path={path} selected={selected} accounts={accounts} subjectTypes={subjectTypes} labels={labels} />
      {filtered && <p className="text-sm font-medium">{labels.filterForm.showing}</p>}
      <AuditTable
        entries={page.entries}
        label={heading}
        path={path}
        reversals={reversals}
        empty={filtered ? labels.filterForm.empty : labels.empty}
        labels={labels}
      />
      {(page.nextBefore || !isFirstPage) && (
        <nav className="flex justify-between gap-4 text-sm font-medium">
          {isFirstPage ? <span /> : <Link href={auditUrl(path, selected)}>{labels.newest}</Link>}
          {page.nextBefore && <Link href={auditUrl(path, selected, page.nextBefore)}>{labels.older}</Link>}
        </nav>
      )}
    </>
  );
}
