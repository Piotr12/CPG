"use client";

import { useState } from "react";
import type { Result } from "@cpg/core";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { orderLineDateSchema } from "@cpg/core/validators/purchasing/purchase-order.schema";
import { requisitionDateSchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { errorFormatter } from "../forms/form-labels";

/** What each kind of document changes: its form's field and the shared schema that checks it. */
const KINDS = {
  requisition: { name: "requiredDate", schema: requisitionDateSchema },
  orderLine: { name: "plannedDate", schema: orderLineDateSchema },
} as const;

/** The dialog's strings in the reader's language, all plain, as a server component passes them. */
export interface ChangeDateLabels {
  open: string;
  title: string;
  description: string;
  /** The date field's label. */
  field: string;
  submit: string;
  pending: string;
  cancel: string;
  /** The message for a date that isn't a real `YYYY-MM-DD` one. */
  date: string;
}

export interface ChangeDateDialogProps {
  kind: keyof typeof KINDS;
  /** Whether the trigger shows: an Open document or line, in a writable tenant. */
  available: boolean;
  /** Names the record, as its row's other actions do ("Purchase orders 00000002 — Line 2"). */
  subject: string;
  /** The date the page loaded, prefilled. */
  value: string;
  /** The version the page loaded; a save carries the one the dialog opened with. */
  version: number;
  /** The page's server action, bound to its tenant, generation and record. */
  save: (version: number, values: unknown) => Promise<Result<unknown>>;
  labels: ChangeDateLabels;
  /** Error messages by envelope code. */
  errors: Record<string, string>;
}

/**
 * The Change date action of a requisition row or a purchase-order line (spec
 * 2026-10-21--2036UTC-purchasing-date-edits). It binds the date, version and action it opened with,
 * so a refresh behind it can't rebind the old value to a newer version. Like `LifecycleControl`,
 * `available` hides only the trigger: a refresh that makes the record uneditable keeps the dialog,
 * and the refusal it shows, open.
 */
export function ChangeDateDialog(props: ChangeDateDialogProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(props);
  const close = () => setOpen(false);
  const { name, schema } = KINDS[loaded.kind];
  const t = loaded.labels;
  const formatFieldError = (message: string) => (message === CALENDAR_DATE_MESSAGE ? t.date : message);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {props.available && (
        <DialogTrigger asChild>
          <Button variant="outline" aria-label={`${props.labels.open} — ${props.subject}`} onClick={() => setLoaded(props)}>
            {props.labels.open}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8">
            {t.title} — {loaded.subject}
          </DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={[{ name, label: t.field, type: "date" }]}
          schema={schema}
          initialValues={{ [name]: loaded.value }}
          action={(values) => loaded.save(loaded.version, values)}
          submitLabel={t.submit}
          pendingLabel={t.pending}
          cancelLabel={t.cancel}
          formatError={errorFormatter({ errors: loaded.errors })}
          formatFieldError={formatFieldError}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
