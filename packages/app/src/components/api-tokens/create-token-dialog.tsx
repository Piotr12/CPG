"use client";

import { useState } from "react";
import type { CreatedApiToken } from "@cpg/core";
import { createApiTokenSchema } from "@cpg/core/validators/api-tokens/create-api-token.schema";
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
import { createApiToken } from "../../app/admin/(global)/tokens/actions";
import { errorFormatter, fieldErrorFormatter, type TokensLabels } from "./labels";
import { TokenSecretPanel } from "./token-secret-panel";

/**
 * The Create token button and its dialog: a name and a warning about what the token can do, then
 * the new secret, shown once (API-001, API-006). Closing the dialog drops the secret from memory.
 */
export function CreateTokenDialog({ labels }: { labels: TokensLabels }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const t = labels.create;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setCreated(null);
  }
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>{t.open}</Button>
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <TokenSecretPanel name={created.token.name} secret={created.secret} labels={labels} onDone={close} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{t.description}</DialogDescription>
            </DialogHeader>
            <CrudForm
              fields={[{ name: "name", label: t.name, autoComplete: "off", description: t.nameHint }]}
              schema={createApiTokenSchema}
              action={createApiToken}
              submitLabel={t.submit}
              pendingLabel={t.submitting}
              cancelLabel={labels.cancel}
              formatError={errorFormatter(labels)}
              formatFieldError={fieldErrorFormatter(labels)}
              onSuccess={setCreated}
              onCancel={close}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
