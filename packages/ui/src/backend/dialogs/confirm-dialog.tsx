"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/alert-dialog";
import { Button } from "../../components/button";
import type { ApiResult } from "../api/result";
import { ErrorMessage } from "../feedback/error-message";

export interface ConfirmDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A button that opens the dialog; omit it when something else (a row menu) opens it. */
  trigger?: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel: string;
  /** A red confirm button, for what can't simply be undone. */
  destructive?: boolean;
  /** Usually a server action bound to the record. */
  action: () => Promise<ApiResult<T>>;
  /** Turns an error into the reader's language. */
  formatError?: (error: { code: string; message: string; params?: Record<string, string> }) => ReactNode;
}

/**
 * Asks before a one-click change (deactivate, remove): runs `action` on confirm, closes on success,
 * and otherwise shows the error above the buttons, keeping the dialog open. Cancel and `Escape`
 * close it, clearing the error.
 */
export function ConfirmDialog<T>({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  destructive = false,
  action,
  formatError = ({ message }) => message,
}: ConfirmDialogProps<T>) {
  const [error, setError] = useState<ReactNode>(null);
  const [isPending, startTransition] = useTransition();

  function change(next: boolean) {
    setError(null);
    onOpenChange(next);
  }

  function confirm() {
    startTransition(async () => {
      const result = await action();
      // Wrapped again so the outcome and the end of the pending state render together.
      startTransition(() => {
        if (result.ok) change(false);
        else setError(formatError(result.error));
      });
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={change}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} disabled={isPending} onClick={confirm}>
            {isPending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
