"use client";

import { useState, useTransition } from "react";
import type { ApiTokenSummary } from "@cpg/core";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
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
import { revokeApiToken } from "../../app/admin/(global)/tokens/actions";
import { errorFormatter, withName, type TokensLabels } from "./labels";

/** A token row's Revoke button and its confirmation: anything using the token stops at once (API-008). */
export function RevokeTokenDialog({ token, labels }: { token: ApiTokenSummary; labels: TokensLabels }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const t = labels.revoke;

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError(null);
  }

  function confirm() {
    startTransition(async () => {
      const result = await revokeApiToken({ tokenId: token.id });
      // Wrapped again so the outcome and the end of the pending state render together.
      startTransition(() => {
        if (result.ok) onOpenChange(false);
        else setError(errorFormatter(labels)(result.error));
      });
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={withName(t.label, token.name)}>
          {t.open}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{withName(t.title, token.name)}</AlertDialogTitle>
          <AlertDialogDescription>{t.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
          <Button variant="destructive-solid" disabled={isPending} onClick={confirm}>
            {t.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
