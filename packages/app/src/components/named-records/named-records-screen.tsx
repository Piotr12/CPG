import type { Locale, NamedRecordView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { namedRecordSortSchema, type NamedRecordSort } from "@cpg/core/validators/named-records/named-record-list.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { listLinks, type ListSearchState } from "../lists/list-params";
import { ListSearchBar } from "../lists/list-search-bar";
import { CreateNamedRecordDialog } from "./create-named-record-dialog";
import { namedRecordsLabels, type CreateNamedRecord, type NamedRecordScreenKind, type UpdateNamedRecord } from "./labels";
import { NamedRecordsTable } from "./named-records-table";

interface NamedRecordsScreenProps {
  kind: NamedRecordScreenKind;
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  records: NamedRecordView[];
  locale: Locale;
  messages: Messages;
  /**
   * Only the admin gets Create and the row menus (TEN-004), and only while the tenant isn't
   * read-only (R05; the read-only banner says why); every action checks both again.
   */
  admin: boolean;
  create: CreateNamedRecord;
  update: UpdateNamedRecord;
  /** The search and sort the page read from its address, and listed `records` with (#217). */
  search: ListSearchState;
  sort: { sort: NamedRecordSort; dir: SortDirection };
}

/**
 * The body of the locations, customers and suppliers pages (E03-S02): heading, intro, the admin's
 * Create, the search box and the sortable list (#217). Each page reads its own kind through its
 * tenant's scope and passes its own server actions; the form is bound to the tenant and generation shown.
 */
export function NamedRecordsScreen({ kind, tenant, records, locale, messages, admin, create, update, search, sort }: NamedRecordsScreenProps) {
  const labels = namedRecordsLabels(messages, kind);
  const editable = admin && !tenant.readOnly;
  const links = listLinks({ path: `/admin/${tenant.code}/${kind}`, search: search.q, sort, defaults: namedRecordSortSchema.parse({}) });

  return (
    <div lang={locale}>
      <PageHeader
        title={messages[kind].heading(tenant.name)}
        description={labels.intro}
        actions={editable && <CreateNamedRecordDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={labels} create={create} />}
      />
      <ListSearchBar links={links} search={search} labels={labels.search} lists={messages.lists} locale={locale} count={records.length} />
      <div className="flex flex-col gap-8">
        <NamedRecordsTable
          tenant={tenant}
          records={records}
          labels={labels}
          update={editable ? update : undefined}
          search={search.q}
          sort={sort}
          links={links}
          lists={messages.lists}
        />
      </div>
    </div>
  );
}
