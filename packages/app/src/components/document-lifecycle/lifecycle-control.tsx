"use client";

import { useState } from "react";
import type { Result } from "@cpg/core";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import type { Messages } from "../../i18n/messages/en";
import { errorFormatter, fill, TALL_DIALOG } from "../forms/form-labels";

export interface LifecycleControlProps {
  available: boolean;
  processed: boolean;
  subject: string;
  version: number;
  lines?: string[] | number[];
  quantities: string[];
  notice?: string;
  labels: Messages["lifecycle"];
  errors: Record<string, string>;
  cancel: (values: unknown) => Promise<Result<unknown>>;
  closeEarly: (values: unknown) => Promise<Result<unknown>>;
}

/** A shared confirmation that keeps the original target, version and bound tenant action after refresh. */
export function LifecycleControl(props: LifecycleControlProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(props);
  const close = () => setOpen(false);
  const label = props.processed ? props.labels.closeEarly : props.labels.cancel;
  const loadedLabel = loaded.processed ? loaded.labels.closeEarly : loaded.labels.cancel;
  const action = loaded.processed ? loaded.closeEarly : loaded.cancel;
  return <Dialog open={open} onOpenChange={setOpen}>
    {props.available && <DialogTrigger asChild>
      <Button variant="outline" aria-label={`${label} — ${props.subject}`} onClick={() => setLoaded(props)}>{label}</Button>
    </DialogTrigger>}
    <DialogContent className={TALL_DIALOG}>
      <DialogHeader>
        <DialogTitle className="pr-8">{loadedLabel} — {loaded.subject}</DialogTitle>
        <DialogDescription>{fill(loaded.labels.description, { subject: loaded.subject })}</DialogDescription>
      </DialogHeader>
      <p className="text-sm font-medium">{loaded.labels.abandoned}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm" aria-label={loaded.labels.abandoned}>
        {loaded.quantities.map((quantity, index) => <li key={index}>{quantity}</li>)}
      </ul>
      {loaded.notice && <p className="text-sm" role="status">{loaded.notice}</p>}
      <CrudForm fields={[]}
        action={() => action({ version: loaded.version, ...(loaded.lines ? { lines: loaded.lines } : {}) })}
        submitLabel={loadedLabel} pendingLabel={loaded.labels.pending} cancelLabel={loaded.labels.keepOpen}
        formatError={errorFormatter({ errors: loaded.errors })} onCancel={close} onSuccess={close} />
    </DialogContent>
  </Dialog>;
}
