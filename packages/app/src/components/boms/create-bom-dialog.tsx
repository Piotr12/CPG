"use client";

import { useState } from "react";
import { bomCreateFormSchema } from "@cpg/core/validators/boms/bom-create.schema";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { createBom } from "../../app/admin/[tenant]/boms/actions";
import { TALL_DIALOG } from "../forms/form-labels";
import type { BomsLabels, TenantContext } from "./labels";
import { RecipeForm, type ComponentChoice, type OutputChoice } from "./recipe-form";

interface CreateBomDialogProps {
  context: TenantContext;
  labels: BomsLabels;
  outputs: OutputChoice[];
  choices: ComponentChoice[];
}

/** The admin's Create BOM button and its recipe form; the server assigns the ID and revision 1 (BOM-001). */
export function CreateBomDialog({ context, labels, outputs, choices }: CreateBomDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shrink-0">{t.open}</Button>
      </DialogTrigger>
      <DialogContent className={`sm:max-w-2xl ${TALL_DIALOG}`}>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <RecipeForm
          labels={labels}
          outputs={outputs}
          choices={choices}
          schema={bomCreateFormSchema}
          action={(values) => createBom(context.tenant, context.generation, values)}
          submitLabel={t.submit}
          pendingLabel={t.submitting}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
