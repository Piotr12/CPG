"use client";

import { useState } from "react";
import { materialCreateSchema } from "@cpg/core/validators/materials/material-create.schema";
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
import { createMaterial } from "../../app/admin/[tenant]/materials/actions";
import { errorFormatter, fieldErrorFormatter, type MaterialsLabels, type TenantContext } from "./labels";
import { materialFormFields } from "./material-form-fields";

/** The admin's Create material button and its form; the server assigns the ID (MAT-001). */
export function CreateMaterialDialog({ context, labels }: { context: TenantContext; labels: MaterialsLabels }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={materialFormFields(labels)}
          schema={materialCreateSchema}
          action={(values) => createMaterial(context.tenant, context.generation, values)}
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
