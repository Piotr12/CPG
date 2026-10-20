"use client";

import { useState } from "react";
import { planningParameterCreateFormSchema } from "@cpg/core/validators/planning-parameters/planning-parameter-create.schema";
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
import { addPlanningParameters } from "../../app/admin/[tenant]/planning-parameters/actions";
import { errorFormatter, TALL_DIALOG, type FormOption, type TenantContext } from "../forms/form-labels";
import { fieldErrorFormatter, type PlanningParametersLabels } from "./labels";
import { addFields } from "./planning-parameter-fields";

interface AddPlanningParametersDialogProps {
  context: TenantContext;
  labels: PlanningParametersLabels;
  /** The active materials and locations a new set may pick (MAT-029, LFC-019). */
  materials: FormOption[];
  locations: FormOption[];
}

/** The admin's Add parameters button and its form (MAT-015, MAT-016). */
export function AddPlanningParametersDialog({ context, labels, materials, locations }: AddPlanningParametersDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.add;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent className={TALL_DIALOG}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={addFields(labels, materials, locations)}
          schema={planningParameterCreateFormSchema}
          action={(values) => addPlanningParameters(context.tenant, context.generation, values)}
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
