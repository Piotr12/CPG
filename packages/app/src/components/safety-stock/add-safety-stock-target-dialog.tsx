"use client";

import { useState } from "react";
import { safetyStockTargetCreateSchema } from "@cpg/core/validators/safety-stock/safety-stock-target.schema";
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
import { addSafetyStockTarget } from "../../app/admin/[tenant]/safety-stock/actions";
import { errorFormatter, TALL_DIALOG, type FormOption, type TenantContext } from "../forms/form-labels";
import { fieldErrorFormatter, type SafetyStockLabels } from "./labels";

interface AddSafetyStockTargetDialogProps {
  context: TenantContext;
  labels: SafetyStockLabels;
  /** The active materials and locations a new target may pick (MAT-029, LFC-019). */
  materials: FormOption[];
  locations: FormOption[];
}

/** The admin's Add target button and its form (DEM-015). */
export function AddSafetyStockTargetDialog({ context, labels, materials, locations }: AddSafetyStockTargetDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.form;
  const fields: CrudField[] = [
    { name: "material", label: t.material, type: "select", placeholder: t.choose, options: materials },
    { name: "location", label: t.location, type: "select", placeholder: t.choose, options: locations },
    { name: "effectiveFrom", label: t.effectiveFrom, type: "date", description: t.effectiveFromHint },
    { name: "quantity", label: t.quantity, description: t.quantityHint, autoComplete: "off" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{labels.add.open}</Button>
      </DialogTrigger>
      <DialogContent className={TALL_DIALOG}>
        <DialogHeader>
          <DialogTitle>{labels.add.title}</DialogTitle>
          <DialogDescription>{labels.add.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={fields}
          schema={safetyStockTargetCreateSchema}
          action={(values) => addSafetyStockTarget(context.tenant, context.generation, values)}
          submitLabel={labels.add.submit}
          pendingLabel={labels.add.submitting}
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
