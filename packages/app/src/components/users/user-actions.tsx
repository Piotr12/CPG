"use client";

import { useState } from "react";
import type { UserSummary } from "@cpg/core";
import { Button } from "@cpg/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cpg/ui/components/dropdown-menu";
import { withUsername, type UsersLabels } from "./labels";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { SetActiveDialog } from "./set-active-dialog";

type OpenDialog = "reset" | "active" | null;

/** A normal user's row menu: reset the password, and deactivate or reactivate. There is no delete. */
export function UserActions({ user, labels }: { user: UserSummary; labels: UsersLabels }) {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={withUsername(labels.menu.label, user.username)}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("reset")}>{labels.menu.reset}</DropdownMenuItem>
          {user.active ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen("active")}>
              {labels.menu.deactivate}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setOpen("active")}>{labels.menu.reactivate}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetPasswordDialog user={user} labels={labels} open={open === "reset"} onClose={close} />
      <SetActiveDialog user={user} labels={labels} open={open === "active"} onClose={close} />
    </>
  );
}
