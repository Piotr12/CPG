"use client";

import { useState } from "react";
import { safetyStockTargetChangeFormSchema } from "@cpg/core/validators/safety-stock/safety-stock-target.schema";
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
import { changeSafetyStockTarget, removeSafetyStockTarget } from "../../app/admin/[tenant]/safety-stock/actions";
import { errorFormatter, fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { fieldErrorFormatter, type SafetyStockLabels } from "./labels";
import type { SafetyStockRow } from "./safety-stock-table";

interface SafetyStockTargetActionsProps {
  row: SafetyStockRow;
  context: TenantContext;
  labels: SafetyStockLabels;
}

type OpenDialog = "change" | "remove" | null;

/**
 * A row's menu for the admin: Change target (the quantity, prefilled) and Remove behind a
 * confirmation. Both carry the version the page loaded; a stale one shows the conflict and the page
 * refreshes.
 */
export function SafetyStockTargetActions({ row, context, labels }: SafetyStockTargetActionsProps) {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  const key = { material: row.material, location: row.location, effectiveFrom: row.effectiveFrom };
  const names = { material: row.material, location: row.location, date: row.effectiveFrom };
  const { tenant, generation } = context;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={fill(labels.menu.label, names)}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("change")}>{labels.menu.change}</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setOpen("remove")}>
            {labels.menu.remove}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* No triggers: the row menu opens them, so Radix only ever calls onOpenChange to close. */}
      <Dialog open={open === "change"} onOpenChange={close}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fill(labels.change.title, names)}</DialogTitle>
            <DialogDescription>{fill(labels.change.description, { baseUnit: row.baseUnit })}</DialogDescription>
          </DialogHeader>
          <CrudForm
            fields={[{ name: "quantity", label: labels.form.quantity, description: labels.form.quantityHint, autoComplete: "off", tooltip: fill(labels.form.quantityTip, { baseUnit: row.baseUnit }) }]}
            initialValues={{ quantity: shownQuantity(row.quantity) }}
            schema={safetyStockTargetChangeFormSchema}
            action={(values) => changeSafetyStockTarget(tenant, generation, key, row.version, values)}
            submitLabel={labels.change.submit}
            pendingLabel={labels.change.submitting}
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
        title={fill(labels.remove.title, names)}
        description={labels.remove.description}
        confirmLabel={labels.remove.confirm}
        cancelLabel={labels.cancel}
        destructive
        action={() => removeSafetyStockTarget(tenant, generation, key, row.version)}
        formatError={errorFormatter(labels)}
      />
    </>
  );
}
