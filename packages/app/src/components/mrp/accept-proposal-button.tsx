"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MrpAcceptanceView, Result } from "@cpg/core";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { Button } from "@cpg/ui/components/button";
import { errorMessage } from "../../i18n/error-message";

/** Plain strings only: a label passed to a client component must be data (lesson 2026-10-24). */
export interface AcceptProposalLabels {
  accept: string;
  /** The button's accessible name: which proposal it accepts. */
  acceptLabel: string;
  title: string;
  description: string;
  confirm: string;
  pending: string;
  cancel: string;
  /** Error codes in the reader's language; others keep the server's text. */
  errors: Record<string, string>;
}

interface AcceptProposalButtonProps {
  run: string;
  proposal: string;
  /** The page's server action, bound to its tenant and dataset generation. */
  action: (raw: { run: string; proposal: string }) => Promise<Result<MrpAcceptanceView>>;
  labels: AcceptProposalLabels;
}

/**
 * Accept, and the confirmation naming the document, material, location, quantity and date (E19-S01,
 * RUN-004): nothing is created until the reader confirms, and Cancel or Escape creates nothing. The
 * dialog accepts the run and proposal it was rendered with; a refusal stays in it, in the reader's language.
 * An already accepted proposal refreshes the page only once its dialog closes, so the refusal is read
 * first and the row then shows the document (lesson 2026-10-21: the row's button goes on refresh).
 */
export function AcceptProposalButton({ run, proposal, action, labels }: AcceptProposalButtonProps) {
  const [open, setOpen] = useState(false);
  const accepted = useRef(false);
  const router = useRouter();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && accepted.current) {
          accepted.current = false;
          router.refresh();
        }
      }}
      trigger={<Button variant="outline" size="sm" aria-label={labels.acceptLabel} data-mrp-accept>{labels.accept}</Button>}
      title={labels.title}
      description={labels.description}
      confirmLabel={labels.confirm}
      pendingLabel={labels.pending}
      cancelLabel={labels.cancel}
      action={() => action({ run, proposal })}
      formatError={(error) => {
        accepted.current = error.code === "MRP_PROPOSAL_ACCEPTED";
        return errorMessage(labels.errors, error);
      }}
    />
  );
}
