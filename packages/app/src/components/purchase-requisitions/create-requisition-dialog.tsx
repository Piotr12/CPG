"use client";

import { useState } from "react";
import { requisitionCreateSchema } from "@cpg/core/validators/purchasing/purchase-requisition.schema";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createRequisition } from "../../app/admin/[tenant]/purchase-requisitions/actions";
import { TALL_DIALOG, type FormOption } from "../forms/form-labels";
import type { RequisitionsLabels, TenantContext } from "./labels";
import type { MaterialPick } from "./choices";
import { RequisitionForm } from "./requisition-form";

interface CreateRequisitionDialogProps {
  context: TenantContext;
  labels: RequisitionsLabels;
  materials: MaterialPick[];
  locations: FormOption[];
  locale: string;
}

/** The Create requisition button and its form, for any signed-in account; the server assigns the ID (LFC-001). */
export function CreateRequisitionDialog({ context, labels, materials, locations, locale }: CreateRequisitionDialogProps) {
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
        <RequisitionForm
          labels={labels}
          materials={materials}
          locations={locations}
          locale={locale}
          schema={requisitionCreateSchema}
          action={(values) => createRequisition(context.tenant, context.generation, values)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
