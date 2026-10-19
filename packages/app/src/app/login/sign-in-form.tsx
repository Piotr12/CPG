"use client";

import { useActionState } from "react";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import type { SignInState } from "./actions";

interface SignInFormProps {
  action: (state: SignInState, formData: FormData) => Promise<SignInState>;
}

/**
 * Credentials form. Bespoke rather than `CrudForm`: there is no record to edit, no cancel and one
 * generic error instead of per-field messages, so it isn't form-over-schema.
 */
export function SignInForm({ action }: SignInFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" required autoFocus />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
