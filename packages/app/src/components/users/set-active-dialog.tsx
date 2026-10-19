"use client";

import { useState, useTransition } from "react";
import type { UserSummary } from "@cpg/core";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cpg/ui/components/alert-dialog";
import { Button } from "@cpg/ui/components/button";
import { setUserActive } from "../../app/admin/users/actions";
import { errorFormatter, withUsername, type UsersLabels } from "./labels";

interface SetActiveDialogProps {
  user: UserSummary;
  /** What confirming does, chosen when the dialog opened. */
  mode: "deactivate" | "reactivate";
  labels: UsersLabels;
  open: boolean;
  onClose: () => void;
}

/**
 * Confirms deactivating an active user (signed out everywhere, TEN-007) or reactivating an
 * inactive one (back with their old password, so the dialog suggests a reset).
 */
export function SetActiveDialog({ user, mode, labels, open, onClose }: SetActiveDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deactivating = mode === "deactivate";
  const t = labels[mode];

  function confirm() {
    startTransition(async () => {
      const result = await setUserActive({ userId: user.id, active: !deactivating });
      // Wrapped again so the outcome and the end of the pending state render together.
      startTransition(() => {
        if (result.ok) {
          setError(null);
          onClose();
        } else {
          setError(errorFormatter(labels)(result.error));
        }
      });
    });
  }

  return (
    <AlertDialog
      open={open}
      // There is no trigger: the row menu opens it, so Radix only ever calls this to close.
      onOpenChange={() => {
        setError(null);
        onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{withUsername(t.title, user.username)}</AlertDialogTitle>
          <AlertDialogDescription>{withUsername(t.description, user.username)}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <AlertDialogFooter>
          <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
          <Button variant={deactivating ? "destructive" : "default"} disabled={isPending} onClick={confirm}>
            {t.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
