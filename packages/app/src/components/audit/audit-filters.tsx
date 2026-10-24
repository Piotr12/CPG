import { CircleAlert } from "lucide-react";
import Link from "next/link";
import type { AuditFilterQuery } from "@cpg/core/validators/audit/audit-list.schema";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
import { ErrorSummary } from "@cpg/ui/backend/feedback/error-summary";
import { fill } from "../../i18n/fill";
import type { Messages } from "../../i18n/messages/en";
import { isFiltered, type AuditFilterKey } from "./audit-query";
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
  invalid = [],
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
  /** The filters the server refused: marked invalid and explained above Apply. */
  invalid?: readonly AuditFilterKey[];
  labels: Messages["audit"];
}) {
  const t = labels.filterForm;
  /** Marks a refused field for assistive technology and points it at the explanation. */
  const refused = (key: AuditFilterKey, hint?: string) => {
    const describedBy = [hint, invalid.includes(key) ? "audit-filter-errors" : undefined].filter(Boolean).join(" ");
    return { ...(invalid.includes(key) && { "aria-invalid": true }), ...(describedBy && { "aria-describedby": describedBy }) };
  };
  /**
   * A value the URL holds that the select doesn't offer (an account it doesn't list, a record type of
   * the other audit): its own option, so the select keeps it and Apply sends it back unchanged.
   */
  const unlisted = (value: string | undefined, listed: readonly string[], name?: string) =>
    value !== undefined && !listed.includes(value) && <NativeSelectOption value={value}>{fill(t.unlisted, { value: name ?? value })}</NativeSelectOption>;
  /** A record type's name when it is one at all (the other audit's), checked as an own key: the URL sends any letters. */
  const subjectName = (type = "") => (Object.hasOwn(labels.subjects, type) ? labels.subjects[type as AuditSubjectType] : undefined);
  return (
    <form action={path} aria-label={t.label} className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-3 sm:items-end">
      {/* First, so that from the focused summary Tab reaches the fields to correct. */}
      {invalid.length > 0 && (
        <ErrorSummary id="audit-filter-errors" className="flex gap-2 text-sm text-danger sm:col-span-3">
          <span className="flex h-5 shrink-0 items-center">
            <CircleAlert aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-medium">{t.invalid}</p>
            <ul className="list-disc pl-4">
              {invalid.map((key) => <li key={key}>{t.errors[key]}</li>)}
            </ul>
          </div>
        </ErrorSummary>
      )}
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-subject-type">{t.subjectType}</Label>
        <NativeSelect id="audit-subject-type" name="subjectType" defaultValue={selected.subjectType ?? ""} className="w-full" {...refused("subjectType")}>
          <NativeSelectOption value="">{t.all}</NativeSelectOption>
          {subjectTypes.map((type) => (
            <NativeSelectOption key={type} value={type}>{labels.subjects[type]}</NativeSelectOption>
          ))}
          {unlisted(selected.subjectType, subjectTypes, subjectName(selected.subjectType))}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-subject-id">{t.subjectId}</Label>
        <Input id="audit-subject-id" name="subjectId" defaultValue={selected.subjectId ?? ""} {...refused("subjectId", "audit-subject-id-hint")} />
        <p id="audit-subject-id-hint" className="text-xs text-muted-foreground">{t.subjectIdHint}</p>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-account">{t.account}</Label>
        <NativeSelect id="audit-account" name="account" defaultValue={selected.account ?? ""} className="w-full" {...refused("account")}>
          <NativeSelectOption value="">{t.all}</NativeSelectOption>
          {accounts.map((account) => (
            <NativeSelectOption key={account} value={account}>{account}</NativeSelectOption>
          ))}
          {unlisted(selected.account, accounts)}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-channel">{t.channel}</Label>
        <NativeSelect id="audit-channel" name="channel" defaultValue={selected.channel ?? ""} className="w-full" {...refused("channel")}>
          <NativeSelectOption value="">{t.all}</NativeSelectOption>
          <NativeSelectOption value="ui">{labels.channels.ui}</NativeSelectOption>
          <NativeSelectOption value="api">{labels.channels.api}</NativeSelectOption>
          {unlisted(selected.channel, ["ui", "api"])}
        </NativeSelect>
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-from">{t.from}</Label>
        <Input id="audit-from" name="from" type="date" defaultValue={selected.from ?? ""} {...refused("from")} />
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="audit-to">{t.to}</Label>
        <Input id="audit-to" name="to" type="date" defaultValue={selected.to ?? ""} {...refused("to")} />
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
