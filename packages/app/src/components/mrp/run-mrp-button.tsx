"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import type { MrpRunAnswer, Result } from "@cpg/core";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { SegmentedControl } from "@cpg/ui/backend/forms/segmented-control";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cpg/ui/components/alert-dialog";
import { Button } from "@cpg/ui/components/button";
import { errorMessage } from "../../i18n/error-message";

/** How the dialog asks the run to create documents (E19-S03). */
export type RunMrpMode = "manual" | "automatic";

/** Plain strings only: a label passed to a client component must be data (lesson 2026-10-24). */
export interface RunMrpLabels {
  run: string;
  running: string;
  title: string;
  /** The tenant already filled in. */
  description: string;
  creation: string;
  manual: string;
  automatic: string;
  /** What each mode does, under the choice. */
  help: string;
  cancel: string;
  /** Error codes in the reader's language; others keep the server's text. */
  errors: Record<string, string>;
}

/**
 * The MRP page's Run MRP (E14-S02): a dialog that asks how documents are created (E19-S03, RUN-003, RUN-007).
 * It opens on Manual every time, so Automatic is always an explicit choice; Cancel and Escape run nothing. The
 * page refreshes with the new run; a refusal stays in the dialog, in the reader's language. `action` is the
 * server action, bound by the page to its tenant and dataset generation.
 */
export function RunMrpButton({ action, labels }: { action: (raw: { mode: RunMrpMode }) => Promise<Result<MrpRunAnswer>>; labels: RunMrpLabels }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const creationId = useId();

  function change(next: boolean) {
    setError(null);
    setOpen(next);
  }

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The radios are native, so the form holds the choice; the content unmounts on close, so the next open starts on Manual.
    const mode: RunMrpMode = new FormData(event.currentTarget).get("mode") === "automatic" ? "automatic" : "manual";
    setError(null);
    startTransition(async () => {
      const result = await action({ mode });
      // Wrapped again so the outcome and the end of the pending state render together.
      startTransition(() => {
        if (result.ok) change(false);
        else setError(errorMessage(labels.errors, result.error));
      });
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      <AlertDialogTrigger asChild>
        <Button data-mrp-run>{labels.run}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-mrp-run-dialog>
        <form onSubmit={run} className="grid gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{labels.title}</AlertDialogTitle>
            <AlertDialogDescription>{labels.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2" data-mrp-mode>
            <span id={creationId} className="text-sm font-medium">{labels.creation}</span>
            <SegmentedControl
              name="mode"
              defaultValue="manual"
              aria-labelledby={creationId}
              options={[{ value: "manual", label: labels.manual }, { value: "automatic", label: labels.automatic }]}
            />
            <p className="text-sm text-muted-foreground">{labels.help}</p>
          </div>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{labels.cancel}</AlertDialogCancel>
            <Button type="submit" disabled={isPending} data-mrp-run-submit>
              {isPending ? labels.running : labels.run}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
