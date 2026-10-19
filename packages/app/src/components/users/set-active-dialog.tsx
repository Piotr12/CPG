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

interface SetActiveDialogProps {
  user: UserSummary;
  open: boolean;
  onClose: () => void;
}

/**
 * Confirms deactivating an active user (signed out everywhere, TEN-007) or reactivating an
 * inactive one (back with their old password, so the dialog suggests a reset).
 */
export function SetActiveDialog({ user, open, onClose }: SetActiveDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const deactivating = user.active;

  function confirm() {
    startTransition(async () => {
      const result = await setUserActive({ userId: user.id, active: !deactivating });
      // Wrapped again so the outcome and the end of the pending state render together.
      startTransition(() => {
        if (result.ok) {
          setError(null);
          onClose();
        } else {
          setError(result.error.message);
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
          <AlertDialogTitle>
            {deactivating ? `Deactivate ${user.username}?` : `Reactivate ${user.username}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {deactivating
              ? `${user.username} is signed out everywhere and can't sign in until reactivated. The account and its history stay.`
              : `${user.username} can sign in again with their current password. Reset it too if the account may have been compromised.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant={deactivating ? "destructive" : "default"} disabled={isPending} onClick={confirm}>
            {deactivating ? "Deactivate" : "Reactivate"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
