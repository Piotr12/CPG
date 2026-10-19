import type { Locale, NamedRecordView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { CreateNamedRecordDialog } from "./create-named-record-dialog";
import { namedRecordsLabels, type CreateNamedRecord, type NamedRecordScreenKind, type UpdateNamedRecord } from "./labels";
import { NamedRecordsTable } from "./named-records-table";

interface NamedRecordsScreenProps {
  kind: NamedRecordScreenKind;
  tenant: { code: string; name: string; generation: number };
  records: NamedRecordView[];
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Create and the row menus (TEN-004); every action checks it again. */
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

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages[kind].heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {admin && <CreateNamedRecordDialog context={{ tenant: tenant.code, generation: tenant.generation }} labels={labels} create={create} />}
      </div>
      <NamedRecordsTable tenant={tenant} records={records} labels={labels} update={admin ? update : undefined} />
    </div>
  );
}
