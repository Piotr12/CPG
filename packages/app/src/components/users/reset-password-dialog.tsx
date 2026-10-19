"use client";

import type { UserSummary } from "@cpg/core";
import { newPasswordSchema } from "@cpg/core/validators/users/reset-password.schema";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@cpg/ui/components/dialog";
import { resetUserPassword } from "../../app/admin/users/actions";
import { errorFormatter, fieldErrorFormatter, withUsername, type UsersLabels } from "./labels";

interface ResetPasswordDialogProps {
  user: UserSummary;
  labels: UsersLabels;
  open: boolean;
  onClose: () => void;
}

/** Sets a new password for a normal user; their sessions end at once (TEN-006). */
export function ResetPasswordDialog({ user, labels, open, onClose }: ResetPasswordDialogProps) {
  const t = labels.reset;
  return (
    // There is no trigger: the row menu opens it, so Radix only ever calls onOpenChange to close.
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{withUsername(t.title, user.username)}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={[
            { name: "password", label: t.password, type: "password", autoComplete: "new-password", description: t.passwordHint },
          ]}
          schema={newPasswordSchema}
          action={({ password }) => resetUserPassword({ userId: user.id, password })}
          submitLabel={t.submit}
          pendingLabel={t.submitting}
          cancelLabel={labels.cancel}
          formatError={errorFormatter(labels)}
          formatFieldError={fieldErrorFormatter(labels)}
          onSuccess={onClose}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
