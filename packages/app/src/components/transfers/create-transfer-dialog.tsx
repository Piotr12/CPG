"use client";

import { useState } from "react";
import { transferCreateSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createTransfer } from "../../app/admin/[tenant]/transfers/actions";
import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
import { TALL_DIALOG } from "../forms/form-labels";
import type { MaterialPick } from "../purchase-requisitions/choices";
import type { TenantContext, TransfersLabels } from "./labels";
import { TransferForm } from "./transfer-form";

interface CreateTransferDialogProps {
  context: TenantContext;
  labels: TransfersLabels;
  materials: MaterialPick[];
  locations: AutocompleteOption[];
  locale: string;
}

/** The Create transfer button and its form, for any signed-in account; the server assigns the ID (LFC-001). */
export function CreateTransferDialog({ context, labels, materials, locations, locale }: CreateTransferDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-xl ${TALL_DIALOG}`}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <TransferForm
          labels={labels}
          materials={materials}
          locations={locations}
          locale={locale}
          schema={transferCreateSchema}
          action={(values) => createTransfer(context.tenant, context.generation, values)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
