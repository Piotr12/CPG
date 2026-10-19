"use client";

import { useState } from "react";
import type { MaterialSummary } from "@cpg/core";
import { materialCreateSchema } from "@cpg/core/validators/materials/material-create.schema";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
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
import { updateMaterial } from "../../app/admin/[tenant]/materials/actions";
import { errorFormatter, fieldErrorFormatter, fill, type MaterialsLabels, type TenantContext } from "./labels";
import { materialFormFields } from "./material-form-fields";

interface MaterialControlsProps {
  material: MaterialSummary;
  context: TenantContext;
  labels: MaterialsLabels;
}

/**
 * The admin's Edit and Deactivate/Reactivate buttons on a material's page. Both carry the version
 * the page loaded; a stale one shows the conflict and the page refreshes (AUD-024).
 */
export function MaterialControls({ material, context, labels }: MaterialControlsProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const update = (values: unknown) =>
    updateMaterial(context.tenant, context.generation, material.id, material.version, values);
  const close = () => setEditing(false);
  const t = labels.edit;
  const toggle = material.active ? labels.deactivate : labels.reactivate;

  return (
    <div className="flex shrink-0 gap-2">
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogTrigger asChild>
          <Button variant="outline">{t.open}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fill(t.title, { id: material.id })}</DialogTitle>
            <DialogDescription>{t.description}</DialogDescription>
          </DialogHeader>
          <CrudForm
            fields={materialFormFields(labels)}
            initialValues={{ type: material.type, description: material.description, baseUnit: material.baseUnit }}
            schema={materialCreateSchema}
            action={update}
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
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        trigger={<Button variant="outline">{toggle.open}</Button>}
        title={fill(toggle.title, { id: material.id })}
        description={toggle.description}
        confirmLabel={toggle.confirm}
        cancelLabel={labels.cancel}
        destructive={material.active}
        action={() => update({ active: !material.active })}
        formatError={errorFormatter(labels)}
      />
    </div>
  );
}
