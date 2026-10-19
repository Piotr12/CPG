import type { NamedRecordView, Result } from "@cpg/core";
import {
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
} from "@cpg/core/validators/named-records/named-record-fields.schema";
import type { Messages } from "../../i18n/messages/en";

/** The screens that list a kind of named record: locations, customers, suppliers (E03-S02). */
export type NamedRecordScreenKind = "locations" | "customers" | "suppliers";

/**
 * One kind's screen strings in the reader's language: plain strings, so they can reach client
 * components (the server-side `heading` stays behind). `errors` holds every code the screen can show.
 */
export type NamedRecordsLabels = Omit<Messages["locations"], "heading" | "errors"> & { errors: Record<string, string> };

/** Creates a record of the page's kind in the bound tenant and generation (a server action). */
export type CreateNamedRecord = (tenant: string, generation: number, values: unknown) => Promise<Result<NamedRecordView>>;

/** Renames and/or (de)activates a record at the version the page loaded (a server action). */
export type UpdateNamedRecord = (
  tenant: string,
  generation: number,
  id: string,
  version: number,
  values: unknown,
) => Promise<Result<NamedRecordView>>;

/** Builds a kind's labels from a dictionary (server side, where `messages` is available). */
export function namedRecordsLabels(messages: Messages, kind: NamedRecordScreenKind): NamedRecordsLabels {
  const labels: Partial<Messages[NamedRecordScreenKind]> = { ...messages[kind] };
  delete labels.heading;
  return { ...(labels as Omit<Messages[NamedRecordScreenKind], "heading">), errors: { ...messages.errors, ...messages[kind].errors } };
}

/** A field message from the shared schema in the reader's language; unknown messages pass through. */
export function fieldErrorFormatter(labels: NamedRecordsLabels) {
  const known: Record<string, string> = {
    [NAME_REQUIRED_MESSAGE]: labels.fieldErrors.nameRequired,
    [NAME_TOO_LONG_MESSAGE]: labels.fieldErrors.nameTooLong,
  };
  return (message: string): string => known[message] ?? message;
}
