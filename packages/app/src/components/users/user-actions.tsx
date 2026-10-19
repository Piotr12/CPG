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
import { ResetPasswordDialog } from "./reset-password-dialog";
import { SetActiveDialog } from "./set-active-dialog";

type OpenDialog = "reset" | "active" | null;

/** A normal user's row menu: reset the password, and deactivate or reactivate. There is no delete. */
export function UserActions({ user }: { user: UserSummary }) {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label={`Actions for ${user.username}`}>
            ⋯
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen("reset")}>Reset password</DropdownMenuItem>
          {user.active ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpen("active")}>
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setOpen("active")}>Reactivate</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetPasswordDialog user={user} open={open === "reset"} onClose={close} />
      <SetActiveDialog user={user} open={open === "active"} onClose={close} />
    </>
  );
}
