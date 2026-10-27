"use client";

import { useState } from "react";
import { planningParameterChangeFormSchema } from "@cpg/core/validators/planning-parameters/planning-parameter-change.schema";
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
import { changePlanningParameters, removePlanningParameters } from "../../app/admin/[tenant]/planning-parameters/actions";
import { errorFormatter, TALL_DIALOG, fill, shownQuantity, type TenantContext } from "../forms/form-labels";
import { fieldErrorFormatter, type PlanningParametersLabels } from "./labels";
import { valueFields } from "./planning-parameter-fields";
import type { PlanningParameterRow } from "./planning-parameters-table";

interface PlanningParameterActionsProps {
  row: PlanningParameterRow;
  context: TenantContext;
  labels: PlanningParametersLabels;
}

type OpenDialog = "change" | "remove" | null;

/**
 * A row's menu for the admin: Change (the four values, prefilled) and Remove behind a confirmation.
 * Both carry the version the page loaded; a stale one shows the conflict and the page refreshes.
 */
export function PlanningParameterActions({ row, context, labels }: PlanningParameterActionsProps) {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  const pair = { material: row.material, location: row.location };
  const { tenant, generation } = context;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={fill(labels.menu.label, pair)}>
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
        <DialogContent className={TALL_DIALOG}>
          <DialogHeader>
            <DialogTitle>{fill(labels.change.title, pair)}</DialogTitle>
            <DialogDescription>{fill(labels.change.description, { baseUnit: row.baseUnit })}</DialogDescription>
          </DialogHeader>
          <CrudForm
            fields={valueFields(labels, () => row.baseUnit)}
            initialValues={{
              procurement: row.procurement,
              leadTimeDays: String(row.leadTimeDays),
              minimumQuantity: shownQuantity(row.minimumQuantity),
              lotMultiple: shownQuantity(row.lotMultiple),
            }}
            schema={planningParameterChangeFormSchema}
            action={(values) => changePlanningParameters(tenant, generation, row.material, row.location, row.version, values)}
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
        title={fill(labels.remove.title, pair)}
        description={labels.remove.description}
        confirmLabel={labels.remove.confirm}
        cancelLabel={labels.cancel}
        destructive
        action={() => removePlanningParameters(tenant, generation, row.material, row.location, row.version)}
        formatError={errorFormatter(labels)}
      />
    </>
  );
}
