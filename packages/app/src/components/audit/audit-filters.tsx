import Link from "next/link";
import type { AuditFilterQuery } from "@cpg/core/validators/audit/audit-list.schema";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import type { Messages } from "../../i18n/messages/en";
import { isFiltered } from "./audit-query";
import type { AuditSubjectType } from "./subject-types";

/**
 * The filter form above an audit (E13-S03): record type and ID, account, channel and a range of UTC
 * days. A plain GET form, so a filtered view is a URL that can be bookmarked or shared, and the same
 * parameters work on the API. Applying starts again from the newest matching entry.
 */
export function AuditFilters({
  path,
  selected,
  accounts,
  subjectTypes,
  labels,
}: {
  /** The audit screen's path, the form's action. */
  path: string;
  /** The filters the page was read with. */
  selected: AuditFilterQuery;
  /** Every account's username, for the account select. */
  accounts: readonly string[];
  /** The record types this audit holds. */
  subjectTypes: readonly AuditSubjectType[];
  labels: Messages["audit"];
}) {
  const t = labels.filterForm;
  return (
    <form action={path} aria-label={t.label} className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-3 sm:items-end">
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-subject-type">{t.subjectType}</Label>
        <NativeSelect id="audit-subject-type" name="subjectType" defaultValue={selected.subjectType ?? ""} className="w-full">
          <NativeSelectOption value="">{t.all}</NativeSelectOption>
          {subjectTypes.map((type) => (
            <NativeSelectOption key={type} value={type}>{labels.subjects[type]}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-subject-id">{t.subjectId}</Label>
        <Input id="audit-subject-id" name="subjectId" defaultValue={selected.subjectId ?? ""} aria-describedby="audit-subject-id-hint" />
        <p id="audit-subject-id-hint" className="text-xs text-muted-foreground">{t.subjectIdHint}</p>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-account">{t.account}</Label>
        <NativeSelect id="audit-account" name="account" defaultValue={selected.account ?? ""} className="w-full">
          <NativeSelectOption value="">{t.all}</NativeSelectOption>
          {accounts.map((account) => (
            <NativeSelectOption key={account} value={account}>{account}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-channel">{t.channel}</Label>
        <NativeSelect id="audit-channel" name="channel" defaultValue={selected.channel ?? ""} className="w-full">
          <NativeSelectOption value="">{t.all}</NativeSelectOption>
          <NativeSelectOption value="ui">{labels.channels.ui}</NativeSelectOption>
          <NativeSelectOption value="api">{labels.channels.api}</NativeSelectOption>
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-from">{t.from}</Label>
        <Input id="audit-from" name="from" type="date" defaultValue={selected.from ?? ""} />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-to">{t.to}</Label>
        <Input id="audit-to" name="to" type="date" defaultValue={selected.to ?? ""} />
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit">{t.apply}</Button>
        {isFiltered(selected) && (
          <Link href={path} className="text-sm font-medium underline underline-offset-4">{t.clear}</Link>
        )}
      </div>
    </form>
  );
}
