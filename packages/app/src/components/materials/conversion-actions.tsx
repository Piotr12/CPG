"use client";

import { useState } from "react";
import type { ConversionView, MaterialSummary } from "@cpg/core";
import { conversionFactorFormSchema } from "@cpg/core/validators/materials/conversion.schema";
import { isStatisticalUnit } from "@cpg/core/validators/units/unit-registry";
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
import { changeConversion, removeConversion } from "../../app/admin/[tenant]/materials/actions";
import { errorFormatter, fieldErrorFormatter, fill, type MaterialsLabels, type TenantContext } from "./labels";
import { conversionFormFields } from "./material-form-fields";

interface ConversionActionsProps {
  material: MaterialSummary;
  conversion: ConversionView;
  context: TenantContext;
  labels: MaterialsLabels;
}

type OpenDialog = "change" | "remove" | null;

/** A conversion row's menu for the admin: change the factor, or remove the conversion. */
export function ConversionActions({ material, conversion, context, labels }: ConversionActionsProps) {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  const { unit, version } = conversion;
  const t = labels.conversions;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={fill(t.menu.label, { unit })}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("change")}>{t.menu.change}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen("remove")}>
            {t.menu.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* No trigger: the row menu opens it, so Radix only ever calls onOpenChange to close. */}
      <Dialog open={open === "change"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fill(t.change.title, { unit })}</DialogTitle>
            {/* Reports read SU at today's factor, so a new SU factor reaches all of history (#239, Q4). */}
            <DialogDescription>{isStatisticalUnit(unit) ? t.change.statisticalDescription : t.change.description}</DialogDescription>
          </DialogHeader>
          <CrudForm
            fields={conversionFormFields(labels, material.baseUnit, { unit })}
            initialValues={{ numerator: conversion.numerator, denominator: conversion.denominator }}
            schema={conversionFactorFormSchema}
            action={(values) => changeConversion(context.tenant, context.generation, material.id, unit, version, values)}
            submitLabel={t.change.submit}
            pendingLabel={t.change.submitting}
            cancelLabel={labels.cancel}
            infoLabel={labels.infoLabel}
            formatError={errorFormatter(labels)}
            formatFieldError={fieldErrorFormatter(labels)}
            onSuccess={close}
            onCancel={close}
          />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={open === "remove"}
        onOpenChange={close}
        title={fill(t.remove.title, { unit })}
        description={fill(t.remove.description, { unit })}
        confirmLabel={t.remove.confirm}
        cancelLabel={labels.cancel}
        destructive
        action={() => removeConversion(context.tenant, context.generation, material.id, unit, version)}
        formatError={errorFormatter(labels)}
      />
    </>
  );
}
