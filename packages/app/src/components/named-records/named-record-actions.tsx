"use client";

import { deactivationBlockerError } from "../master-data/deactivation-blocker-error";

import { useState } from "react";
import type { NamedRecordView } from "@cpg/core";
import { namedRecordCreateSchema } from "@cpg/core/validators/named-records/named-record-create.schema";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@cpg/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cpg/ui/components/dropdown-menu";
import { fill, type TenantContext } from "../forms/form-labels";
import { nameField } from "./create-named-record-dialog";
import { fieldErrorFormatter, type NamedRecordsLabels, type UpdateNamedRecord } from "./labels";

interface NamedRecordActionsProps {
  record: NamedRecordView;
  context: TenantContext;
  labels: NamedRecordsLabels;
  /** The kind's update action, called with this row's ID and the version the page loaded. */
  update: UpdateNamedRecord;
}

type OpenDialog = "edit" | "active" | null;

/**
 * A row's menu for the admin: Edit (the name), and Deactivate or Reactivate behind a confirmation.
 * Both carry the version the page loaded; a stale one shows the conflict and the page refreshes.
 */
export function NamedRecordActions({ record, context, labels, update }: NamedRecordActionsProps) {
  const [open, setOpen] = useState<OpenDialog>(null);
  // Fixed when the confirmation opens, so its wording doesn't flip while it closes over the refreshed list.
  const [target, setTarget] = useState(!record.active);
  const close = () => setOpen(null);
  const write = (values: unknown) => update(context.tenant, context.generation, record.id, record.version, values);
  const confirm = target ? labels.reactivate : labels.deactivate;
  const id = { id: record.id };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={fill(labels.menu.label, id)}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("edit")}>{labels.menu.edit}</DropdownMenuItem>
          <DropdownMenuItem
            variant={record.active ? "destructive" : "default"}
            onSelect={() => {
              setTarget(!record.active);
              setOpen("active");
            }}
          >
            {record.active ? labels.menu.deactivate : labels.menu.reactivate}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* No triggers: the row menu opens them, so Radix only ever calls onOpenChange to close. */}
      <Dialog open={open === "edit"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fill(labels.edit.title, id)}</DialogTitle>
            <DialogDescription>{labels.edit.description}</DialogDescription>
          </DialogHeader>
          <CrudForm
            fields={nameField(labels)}
            initialValues={{ name: record.name }}
            schema={namedRecordCreateSchema}
            action={write}
            submitLabel={labels.edit.submit}
            pendingLabel={labels.edit.submitting}
            cancelLabel={labels.cancel}
            formatError={deactivationBlockerError(labels, context.tenant)}
            formatFieldError={fieldErrorFormatter(labels)}
            onSuccess={close}
            onCancel={close}
          />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={open === "active"}
        onOpenChange={close}
        title={fill(confirm.title, id)}
        description={confirm.description}
        confirmLabel={confirm.confirm}
        cancelLabel={labels.cancel}
        destructive={!target}
        action={() => write({ active: target })}
        formatError={deactivationBlockerError(labels, context.tenant)}
      />
    </>
  );
}
