"use client";
import { useState, type ReactNode } from "react";
import { stockReversalSchema } from "@cpg/core/validators/stock/stock-reversal.schema";
import { CrudForm, type CrudFormProps } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { TALL_DIALOG } from "../forms/form-labels";

type Refusal = Parameters<NonNullable<CrudFormProps<unknown>["formatError"]>>[0];

export interface ReversalConfirmLabels {
  open: string; title: string; description: string; reason: string; submit: string; pending: string; cancel: string;
}

/**
 * The one full-reversal confirmation (#91 lines, E11-S03 completions and transfer postings): what will
 * be inverted, a required reason, no quantity or date input. The target is snapshotted when the dialog
 * opens, so a refresh behind it never retargets the confirmation; a refusal keeps the dialog and reason.
 */
export function ReversalConfirmDialog<T>({ target, labels, summary, footnote, action, formatError, formatFieldError, afterRefusal }: {
  target: T;
  labels: ReversalConfirmLabels;
  /** What will be inverted and what follows, above the reason. */
  summary: (target: T) => ReactNode;
  footnote?: (target: T) => ReactNode;
  action: (target: T, values: Record<string, string>) => ReturnType<CrudFormProps<unknown>["action"]>;
  formatError: CrudFormProps<unknown>["formatError"];
  formatFieldError: CrudFormProps<unknown>["formatFieldError"];
  /** Further help for a refusal, such as a link to the reversal that already exists. */
  afterRefusal: (target: T, error: Refusal) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(target);
  const [help, setHelp] = useState<ReactNode>(null);
  const current = open ? snapshot : target;
  const close = () => setOpen(false);
  return <Dialog open={open} onOpenChange={(next) => {
    if (next) { setSnapshot(target); setHelp(null); }
    setOpen(next);
  }}>
    <DialogTrigger asChild><Button variant="outline" size="sm">{labels.open}</Button></DialogTrigger>
    <DialogContent className={TALL_DIALOG}>
      <DialogHeader><DialogTitle className="pr-8">{labels.title}</DialogTitle><DialogDescription>{labels.description}</DialogDescription></DialogHeader>
      {summary(current)}
      <CrudForm fields={[{ name: "reason", label: labels.reason, autoComplete: "off" }]} schema={stockReversalSchema}
        action={async (values) => {
          const result = await action(current, values);
          if (!result.ok) setHelp(afterRefusal(current, result.error));
          return result;
        }}
        submitLabel={labels.submit} pendingLabel={labels.pending} cancelLabel={labels.cancel}
        formatError={formatError} formatFieldError={formatFieldError} onSuccess={close} onCancel={close} />
      {help}
      {footnote?.(current)}
    </DialogContent>
  </Dialog>;
}
