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

/** The Create user button and its form (TEN-004). */
export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Create user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They sign in at /login with this username and password. Only you can change the password later.
          </DialogDescription>
        </DialogHeader>
        <CrudForm
          fields={[
            { name: "username", label: "Username", autoComplete: "off" },
            {
              name: "password",
              label: "Initial password",
              type: "password",
              autoComplete: "new-password",
              description: "At least 12 characters.",
            },
          ]}
          schema={createUserSchema}
          action={createUser}
          submitLabel="Create user"
          pendingLabel="Creating…"
          onSuccess={close}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
