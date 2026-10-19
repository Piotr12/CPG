"use client";

import { useState } from "react";
import { createUserSchema } from "@cpg/core/validators/users/create-user.schema";
import { CrudForm } from "@cpg/ui/backend/forms/crud-form";
import { Button } from "@cpg/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cpg/ui/components/dialog";
import { createUser } from "../../app/admin/users/actions";
import { errorFormatter, fieldErrorFormatter, type UsersLabels } from "./labels";

/** The Create user button and its form (TEN-004). */
export function CreateUserDialog({ labels }: { labels: UsersLabels }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = labels.create;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t.open}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={[
            { name: "username", label: t.username, autoComplete: "off" },
            { name: "password", label: t.password, type: "password", autoComplete: "new-password", description: t.passwordHint },
          ]}
          schema={createUserSchema}
          action={createUser}
          submitLabel={t.submit}
          pendingLabel={t.submitting}
          cancelLabel={labels.cancel}
          formatError={errorFormatter(labels)}
          formatFieldError={fieldErrorFormatter(labels)}
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
