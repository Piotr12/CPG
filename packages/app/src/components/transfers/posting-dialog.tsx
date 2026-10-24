"use client";

import { useState } from "react";
import type { TransferPostingKind } from "@cpg/core";
import { transferPostingSchema, transferWriteOffSchema } from "@cpg/core/validators/transfers/transfer.schema";
import { CrudForm, type CrudField } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { dispatchTransfer, receiveTransfer, writeOffTransfer } from "../../app/admin/[tenant]/transfers/[id]/actions";
import { TALL_DIALOG } from "../forms/form-labels";
import { errorFormatter, fieldErrorFormatter, type TenantContext, type TransfersLabels } from "./labels";

/** Each kind's server action: all three are bound to the page's tenant, generation and transfer. */
const ACTIONS = { dispatch: dispatchTransfer, receipt: receiveTransfer, "write-off": writeOffTransfer } satisfies Record<TransferPostingKind, unknown>;

interface PostingDialogProps {
  context: TenantContext;
  /** The transfer the page shows; every posting from here is on it. */
  transfer: string;
  kind: TransferPostingKind;
  /** The dialog's title and description, already filled with the transfer's locations and limit. */
  title: string;
  description: string;
  /** The material's units, its base unit first. */
  units: string[];
  labels: Pick<TransfersLabels, "post" | "cancel" | "errors" | "fieldErrors">;
  /** The page's one solid action: the first posting it offers. The others are outline buttons. */
  primary: boolean;
}

/**
 * A Dispatch, Receive or Write off button and its form, for any signed-in account: a quantity in any
 * unit the material converts, and for a write-off the reason (spec Q4–Q6). The server dates it today
 * and repeats every check; a refusal keeps the dialog open with its explanation.
 */
export function PostingDialog({ context, transfer, kind, title, description, units, labels, primary }: PostingDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.post;
  const fields: CrudField[] = [
    { name: "quantity", label: t.quantity, description: t.quantityHint, autoComplete: "off" },
    { name: "unit", label: t.unit, type: "select", options: units.map((unit) => ({ value: unit, label: unit })) },
    ...(kind === "write-off" ? [{ name: "reason", label: t.reason, autoComplete: "off" }] : []),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={primary ? "default" : "outline"}>{t[kind].open}</Button>
      </DialogTrigger>
      <DialogContent className={TALL_DIALOG}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={fields}
          schema={kind === "write-off" ? transferWriteOffSchema : transferPostingSchema}
          initialValues={{ unit: units[0] }}
          action={(values) => ACTIONS[kind](context.tenant, context.generation, transfer, values)}
          submitLabel={t[kind].submit}
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
