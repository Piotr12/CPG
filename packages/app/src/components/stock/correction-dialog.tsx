"use client";
import { useState } from "react";
import { stockCorrectionSchema } from "@cpg/core/validators/stock/stock-correction.schema";
import { CrudForm, type CrudField } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { postStockCorrection } from "../../app/admin/[tenant]/stock/actions";
import { errorFormatter, TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { stockFieldError, type StockLabels } from "./labels";

const fieldsSchema = stockCorrectionSchema.omit({ material: true, location: true });
/** A reasoned signed change for the selected pair; both roles use the same server action. */
export function CorrectionDialog({ context, pair, units, labels }: {
  context: TenantContext; pair: { material: string; location: string }; units: string[]; labels: StockLabels;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.form;
  const fields: CrudField[] = [
    { name: "quantity", label: t.quantity, description: t.quantityHint, autoComplete: "off" },
    { name: "unit", label: t.unit, type: "select", options: units.map((unit) => ({ value: unit, label: unit })) },
    { name: "reason", label: t.reason, autoComplete: "off" },
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>{t.open}</Button></DialogTrigger>
      <DialogContent className={TALL_DIALOG}>
        <DialogHeader><DialogTitle>{t.title}</DialogTitle><DialogDescription>{t.description}</DialogDescription></DialogHeader>
        <CrudForm fields={fields} schema={fieldsSchema} initialValues={{ unit: units[0] }}
          action={(values) => postStockCorrection(context.tenant, context.generation, pair, values)}
          submitLabel={t.submit} pendingLabel={t.pending} cancelLabel={t.cancel}
          formatError={errorFormatter(labels)} formatFieldError={stockFieldError(labels)} onSuccess={close} onCancel={close} />
      </DialogContent>
    </Dialog>
  );
}
