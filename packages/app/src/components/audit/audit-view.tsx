import type { ReactNode } from "react";
import Link from "next/link";
import type { AuditPage } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { AuditTable } from "./audit-table";

/**
 * One audit screen: heading, an optional back link, what this audit holds, the entries and the paging
 * links. Shared by the Global and the tenant audit; each page reads its own entries. The Global audit is
 * in the menu, so only the tenant audit links back (to its tenant home).
 */
export function AuditView({
  heading,
  back,
  intro,
  page,
  path,
  isFirstPage,
  labels,
}: {
  heading: string;
  back?: { href: string; label: string };
  intro: ReactNode;
  page: AuditPage;
  /** This screen's path, for the paging links. */
  path: string;
  isFirstPage: boolean;
  labels: Messages["audit"];
}) {
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
      <AuditTable entries={page.entries} label={heading} labels={labels} />
      {(page.nextBefore || !isFirstPage) && (
        <nav className="flex justify-between gap-4 text-sm font-medium">
          {isFirstPage ? <span /> : <Link href={path}>{labels.newest}</Link>}
          {page.nextBefore && <Link href={`${path}?before=${page.nextBefore}`}>{labels.older}</Link>}
        </nav>
      )}
    </>
  );
}
