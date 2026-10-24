"use client";

import { useState } from "react";
import type { BomView } from "@cpg/core";
import { bomRecipeFormSchema } from "@cpg/core/validators/boms/bom-create.schema";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { setBomActive, updateBomRecipe } from "../../app/admin/[tenant]/boms/actions";
import { TALL_DIALOG } from "../forms/form-labels";
import { errorFormatter, fill, type BomsLabels, type TenantContext } from "./labels";
import { RecipeForm, type ComponentChoice } from "./recipe-form";

interface BomControlsProps {
  bom: BomView;
  /** The output's description and base unit, for the components heading. */
  output: { description: string; baseUnit: string };
  context: TenantContext;
  labels: BomsLabels;
  choices: ComponentChoice[];
  /** The reader's language, for the material pickers. */
  locale: string;
}

/**
 * The admin's Edit recipe and Deactivate/Reactivate buttons on a BOM's page. Both carry the version
 * the page loaded; a stale one shows the conflict and the page refreshes. A save that changes
 * nothing closes the form and says that the current revision stays (BOM-023).
 */
export function BomControls({ bom, output, context, labels, choices, locale }: BomControlsProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [unchanged, setUnchanged] = useState(false);
  // Fixed when the confirmation opens, so a refresh under the open dialog can't flip its wording.
  const [target, setTarget] = useState(!bom.active);
  const close = () => setEditing(false);
  const t = labels.edit;
  const toggle = (active: boolean) => (active ? labels.reactivate : labels.deactivate);
  const confirm = toggle(target);
  const initial = {
    priority: String(bom.priority),
    validFrom: bom.validFrom,
    validThrough: bom.validThrough ?? "",
    components: bom.components.map(({ material, enteredQuantity, enteredUnit }) => ({ material, quantity: enteredQuantity, unit: enteredUnit })),
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <div className="flex gap-2">
        <Dialog
          open={editing}
          onOpenChange={(open) => {
            setEditing(open);
            if (open) setUnchanged(false);
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">{t.open}</Button>
          </DialogTrigger>
          <DialogContent className={`sm:max-w-2xl ${TALL_DIALOG}`}>
            <DialogHeader>
              <DialogTitle>{fill(t.title, { id: bom.id })}</DialogTitle>
              <DialogDescription>{fill(t.description, { next: String(bom.revision + 1) })}</DialogDescription>
            </DialogHeader>
            <RecipeForm
              labels={labels}
              output={output}
              choices={choices}
              locale={locale}
              initial={initial}
              schema={bomRecipeFormSchema}
              action={(values) => updateBomRecipe(context.tenant, context.generation, bom.id, bom.version, values)}
              submitLabel={t.submit}
              pendingLabel={t.submitting}
              onSuccess={(saved) => {
                setUnchanged(saved.revision === bom.revision);
                close();
              }}
              onCancel={close}
            />
          </DialogContent>
        </Dialog>
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) => {
            if (open) setTarget(!bom.active);
            setConfirming(open);
          }}
          trigger={<Button variant="outline">{toggle(!bom.active).open}</Button>}
          title={fill(confirm.title, { id: bom.id })}
          description={confirm.description}
          confirmLabel={confirm.confirm}
          cancelLabel={labels.cancel}
          destructive={!target}
          action={() => setBomActive(context.tenant, context.generation, bom.id, bom.version, target)}
          formatError={errorFormatter(labels)}
        />
      </div>
      {unchanged && (
        <p role="status" className="text-sm text-muted-foreground">
          {fill(labels.unchanged, { number: String(bom.revision) })}
        </p>
      )}
    </div>
  );
}
