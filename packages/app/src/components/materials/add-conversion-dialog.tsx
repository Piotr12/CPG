"use client";

import { useState } from "react";
import type { MaterialSummary } from "@cpg/core";
import { conversionCreateSchema } from "@cpg/core/validators/materials/conversion.schema";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cpg/ui/components/dialog";
import { addConversion } from "../../app/admin/[tenant]/materials/actions";
import { errorFormatter, fieldErrorFormatter, fill, type MaterialsLabels, type TenantContext } from "./labels";
import { conversionFormFields } from "./material-form-fields";
import type { UnitChoices } from "../units/unit-choices";

interface AddConversionDialogProps {
  material: MaterialSummary;
  /** The units it already converts, offered but unselectable. */
  converted: string[];
  units: UnitChoices;
  context: TenantContext;
  labels: MaterialsLabels;
}

/** The admin's Add conversion button and its form: `alternate quantity × unit = base quantity × base unit`. */
export function AddConversionDialog({ material, converted, units, context, labels }: AddConversionDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.conversions.add;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{fill(t.description, { baseUnit: material.baseUnit })}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={conversionFormFields(labels, material.baseUnit, { units, converted })}
          initialValues={{ denominator: "1" }}
          schema={conversionCreateSchema}
          action={(values) => addConversion(context.tenant, context.generation, material.id, values)}
          submitLabel={t.submit}
          pendingLabel={t.submitting}
          cancelLabel={labels.cancel}
          infoLabel={labels.infoLabel}
          formatError={errorFormatter(labels)}
          formatFieldError={fieldErrorFormatter(labels)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
