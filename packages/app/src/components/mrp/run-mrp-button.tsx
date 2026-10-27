"use client";

import { useState, useTransition } from "react";
import type { MrpRunView, Result } from "@cpg/core";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Button } from "@cpg/ui/components/button";
import { errorMessage } from "../../i18n/error-message";

export interface RunMrpLabels {
  run: string;
  running: string;
  /** Error codes in the reader's language; others keep the server's text. */
  errors: Record<string, string>;
}

/**
 * The MRP page's one action (E14-S02): runs MRP at once, with no confirmation, since a run changes no
 * business record (spec Q10). The page refreshes with the new run; a refusal is said under the button.
 * `action` is the server action, bound by the page to its tenant and dataset generation.
 */
export function RunMrpButton({ action, labels }: { action: () => Promise<Result<MrpRunView>>; labels: RunMrpLabels }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      // Wrapped again so the outcome and the end of the pending state render together.
      startTransition(() => setError(result.ok ? null : errorMessage(labels.errors, result.error)));
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button onClick={run} disabled={isPending} data-mrp-run>
        {isPending ? labels.running : labels.run}
      </Button>
      {error && <ErrorMessage>{error}</ErrorMessage>}
    </div>
  );
}
