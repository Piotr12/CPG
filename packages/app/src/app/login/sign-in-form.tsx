"use client";

import { useActionState } from "react";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { Button } from "@cpg/ui/components/button";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import type { Messages } from "../../i18n/messages/en";
import type { SignInState } from "./actions";

interface SignInFormProps {
  action: (state: SignInState, formData: FormData) => Promise<SignInState>;
  labels: Messages["login"];
}

/**
 * Credentials form. Bespoke rather than `CrudForm`: there is no record to edit, no cancel and one
 * generic error instead of per-field messages, so it isn't form-over-schema.
 */
export function SignInForm({ action, labels }: SignInFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">{labels.username}</Label>
        {/* `defaultValue` from the last refusal: React resets the fields after the action, and the typed name must survive it. */}
        <Input id="username" name="username" autoComplete="username" required autoFocus defaultValue={state.username} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && (
        <Callout tone="danger" role="alert">
          {state.error}
        </Callout>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? labels.submitting : labels.submit}
      </Button>
    </form>
  );
}
