"use client";

import type { UserSummary } from "@cpg/core";
import { newPasswordSchema } from "@cpg/core/validators/users/reset-password.schema";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@cpg/ui/components/dialog";
import { resetUserPassword } from "../../app/admin/users/actions";

interface ResetPasswordDialogProps {
  user: UserSummary;
  open: boolean;
  onClose: () => void;
}

/** Sets a new password for a normal user; their sessions end at once (TEN-006). */
export function ResetPasswordDialog({ user, open, onClose }: ResetPasswordDialogProps) {
  return (
    // There is no trigger: the row menu opens it, so Radix only ever calls onOpenChange to close.
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {user.username}</DialogTitle>
          <DialogDescription>This signs them out everywhere. Tell them the new password yourself.</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={[
            {
              name: "password",
              label: "New password",
              type: "password",
              autoComplete: "new-password",
              description: "At least 12 characters.",
            },
          ]}
          schema={newPasswordSchema}
          action={({ password }) => resetUserPassword({ userId: user.id, password })}
          submitLabel="Reset password"
          pendingLabel="Resetting…"
          onSuccess={onClose}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
