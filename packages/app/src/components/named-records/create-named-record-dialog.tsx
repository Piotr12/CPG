"use client";

import { useState } from "react";
import { namedRecordCreateSchema } from "@cpg/core/validators/named-records/named-record-create.schema";
import { CrudForm, type CrudField } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cpg/ui/components/dialog";
import { errorFormatter, type TenantContext } from "../forms/form-labels";
import { fieldErrorFormatter, type CreateNamedRecord, type NamedRecordsLabels } from "./labels";

interface CreateNamedRecordDialogProps {
  context: TenantContext;
  labels: NamedRecordsLabels;
  /** The kind's create action; the server assigns the ID (spec Q2). */
  create: CreateNamedRecord;
}

/** The admin's Create button and its one-field form (Name). */
export function CreateNamedRecordDialog({ context, labels, create }: CreateNamedRecordDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={nameField(labels)}
          schema={namedRecordCreateSchema}
          action={(values) => create(context.tenant, context.generation, values)}
          submitLabel={t.submit}
          pendingLabel={t.submitting}
          cancelLabel={labels.cancel}
          formatError={errorFormatter(labels)}
          formatFieldError={fieldErrorFormatter(labels)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The forms' only field. */
export function nameField(labels: NamedRecordsLabels): CrudField[] {
  return [{ name: "name", label: labels.form.name, autoComplete: "off", description: labels.form.nameHint }];
}
