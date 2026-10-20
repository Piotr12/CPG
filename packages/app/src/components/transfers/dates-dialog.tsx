"use client";

import { useState } from "react";
import { transferDatesSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { CrudForm, type CrudField } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { setTransferDates } from "../../app/admin/[tenant]/transfers/[id]/actions";
import { errorFormatter, fieldErrorFormatter, type TenantContext, type TransfersLabels } from "./labels";

interface DatesDialogProps {
  context: TenantContext;
  /** The transfer the page shows, with the dates and version it loaded (an edit binds to them). */
  transfer: { id: string; plannedDispatch: string; plannedArrival: string; version: number };
  labels: Pick<TransfersLabels, "editDates" | "form" | "cancel" | "errors" | "fieldErrors">;
}

/** The Change dates button and its form (spec Q3, TRF-026): both planned dates, arrival not before dispatch. */
export function DatesDialog({ context, transfer, labels }: DatesDialogProps) {
  const [open, setOpen] = useState(false);
  // The version the dialog opened with: a refresh after a conflict must not rebind the old values to a newer version.
  const [loaded, setLoaded] = useState(transfer);
  const close = () => setOpen(false);
  const t = labels.editDates;
  const fields: CrudField[] = [
    { name: "plannedDispatch", label: labels.form.plannedDispatch, type: "date" },
    { name: "plannedArrival", label: labels.form.plannedArrival, type: "date" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" onClick={() => setLoaded(transfer)}>
          {t.open}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={fields}
          schema={transferDatesSchema}
          initialValues={{ plannedDispatch: loaded.plannedDispatch, plannedArrival: loaded.plannedArrival }}
          action={(values) => setTransferDates(context.tenant, context.generation, loaded.id, loaded.version, values)}
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
