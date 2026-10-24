import type { Locale, NamedRecordView } from "@cpg/core";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
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
}

/**
 * The body of the locations, customers and suppliers pages (E03-S02): heading, intro, the admin's
 * Create, and the list. Each page reads its own kind through its tenant's scope and passes its own
 * server actions; the form is bound to the tenant and generation shown.
 */
export function NamedRecordsScreen({ kind, tenant, records, locale, messages, admin, create, update }: NamedRecordsScreenProps) {
  const labels = namedRecordsLabels(messages, kind);
  const editable = admin && !tenant.readOnly;

  return (
    <div lang={locale}>
      <PageHeader
        title={messages[kind].heading(tenant.name)}
        description={labels.intro}
        actions={editable && <CreateNamedRecordDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={labels} create={create} />}
      />
      <div className="flex flex-col gap-8">
        <NamedRecordsTable tenant={tenant} records={records} labels={labels} update={editable ? update : undefined} />
      </div>
    </div>
  );
}
