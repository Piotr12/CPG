"use client";

import { useState } from "react";
import type { CompletionPreview, ProductionOrderDetail } from "@cpg/core";
import { productionCompletionPreviewSchema } from "@cpg/core/validators/production-orders/production-completion.schema";
import { apiCall } from "@cpg/ui/backend/api/api-call";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { postProductionCompletion } from "../../app/admin/[tenant]/production-orders/actions";
import { errorFormatter, fill, TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { CompletionForm, type CompletionInputChoice } from "./completion-form";
import { completionFieldError, type ProductionLabels } from "./labels";

interface Props {
  context: TenantContext;
  labels: ProductionLabels;
  order: ProductionOrderDetail;
  /** The output's units, its base unit first. */
  outputUnits: string[];
  /** Where the order produces, as the summary names it. */
  locationLabel: string;
  inputs: CompletionInputChoice[];
  /** Whether the order still takes completions: Open, in a writable tenant. The notice of a post outlives the button. */
  canPost: boolean;
  /** The reader's language, for the material picker's counts. */
  locale?: string;
}

/**
 * Post completion (E10-S02): the output first, then what was used, pre-filled from the preview. The
 * dialog's `submission` token is made when it opens and kept until it closes, so a double submit or a
 * retried action posts once (spec Q7).
 */
export function CompletionDialog({ context, labels: t, order, outputUnits, locationLabel, inputs, canPost, locale }: Props) {
  const [open, setOpen] = useState(false);
  const [submission, setSubmission] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({ quantity: "", unit: outputUnits[0] });
  const [preview, setPreview] = useState<CompletionPreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formatError = errorFormatter(t);
  const formatFieldError = completionFieldError(t);
  const close = () => setOpen(false);
  const onOpenChange = (value: boolean) => {
    if (value) {
      setSubmission(crypto.randomUUID());
      setPreview(null);
      setNotice(null);
    }
    setOpen(value);
  };
  return (
    <div className="flex flex-col items-end gap-2">
      {canPost && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button>{t.completion.post}</Button>
          </DialogTrigger>
          <DialogContent className={`sm:max-w-3xl ${TALL_DIALOG}`}>
            <DialogHeader>
              <DialogTitle>{fill(t.completion.title, { id: order.id })}</DialogTitle>
              <DialogDescription>
                {preview
                  ? fill(t.completion.summary, { quantity: preview.quantity, unit: draft.unit, location: locationLabel, bom: order.bom, revision: String(order.revision) })
                  : t.completion.description}
              </DialogDescription>
            </DialogHeader>
            {preview ? (
              <CompletionForm
                labels={t}
                preview={preview}
                unit={draft.unit}
                inputs={inputs}
                locale={locale}
                formatError={formatError}
                formatFieldError={formatFieldError}
                action={(values) => postProductionCompletion(context.tenant, context.generation, order.id, submission, values)}
                onSuccess={(result) => {
                  close();
                  setNotice(fill(t.completion.posted, { id: result.completion.id }));
                }}
                onBack={() => setPreview(null)}
                onCancel={close}
              />
            ) : (
              <CrudForm<CompletionPreview>
                fields={[
                  { name: "quantity", label: t.completion.output, description: t.completion.outputHint },
                  { name: "unit", label: t.completion.unit, type: "select", options: outputUnits.map((unit) => ({ value: unit, label: unit })) },
                ]}
                schema={productionCompletionPreviewSchema}
                initialValues={draft}
                formatError={formatError}
                formatFieldError={formatFieldError}
                submitLabel={t.completion.continue}
                pendingLabel={t.completion.pending}
                cancelLabel={t.completion.cancel}
                onCancel={close}
                action={async (values) => {
                  const result = await apiCall<CompletionPreview>(`/api/tenants/${context.tenant}/production-orders/${order.id}/completions/preview?${new URLSearchParams(values)}`);
                  if (result.ok) {
                    setDraft(values);
                    setPreview(result.data);
                  }
                  return result;
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
      {notice && (
        <Callout tone="success" role="status">
          {notice}
        </Callout>
      )}
    </div>
  );
}
