"use client";

import { useState } from "react";
import { forecastCreateSchema } from "@cpg/core/validators/forecasts/forecast.schema";
import type { AutocompleteOption } from "@cpg/ui/backend/forms/autocomplete";
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
import { addForecast } from "../../app/admin/[tenant]/forecasts/actions";
import { errorFormatter, TALL_DIALOG, type FormOption, type TenantContext } from "../forms/form-labels";
import { fieldErrorFormatter, type ForecastsLabels } from "./labels";

interface AddForecastDialogProps {
  context: TenantContext;
  labels: ForecastsLabels;
  /** The active materials and locations a new forecast may pick (MAT-029, LFC-019); materials through an autocomplete (#217). */
  materials: AutocompleteOption[];
  locations: FormOption[];
  locale?: string;
}

/** The admin's Add forecast button and its form (DEM-001). */
export function AddForecastDialog({ context, labels, materials, locations, locale }: AddForecastDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.form;
  const fields: CrudField[] = [
    { name: "material", label: t.material, type: "autocomplete", placeholder: labels.picker.placeholder, choices: materials, autocompleteLabels: labels.picker.labels },
    { name: "location", label: t.location, type: "select", placeholder: t.choose, options: locations },
    { name: "date", label: t.date, type: "date", description: t.dateHint },
    { name: "quantity", label: t.quantity, description: t.quantityHint, autoComplete: "off" },
    { name: "unit", label: t.unit, description: t.unitHint, autoComplete: "off" },
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
          schema={forecastCreateSchema}
          action={(values) => addForecast(context.tenant, context.generation, values)}
          submitLabel={labels.add.submit}
          pendingLabel={labels.add.submitting}
          cancelLabel={labels.cancel}
          formatError={errorFormatter(labels)}
          formatFieldError={fieldErrorFormatter(labels)}
          onSuccess={close}
          onCancel={close}
          locale={locale}
        />
      </DialogContent>
    </Dialog>
  );
}
