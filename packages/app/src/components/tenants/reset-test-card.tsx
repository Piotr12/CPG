"use client";

import { useState } from "react";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { resetTest } from "../../app/admin/(global)/actions";
import { errorMessage } from "../../i18n/error-message";
import type { Messages } from "../../i18n/messages/en";
import { fill } from "../forms/form-labels";

interface Props {
  generation: number;
  readOnly: boolean;
  labels: Messages["admin"]["reset"];
  errors: Record<string, string>;
}

/** Admin control for Test only. An open confirmation never silently changes its target generation. */
export function ResetTestCard({ generation, readOnly, labels, errors }: Props) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(generation);
  const [success, setSuccess] = useState<string | null>(null);
  return (
    <Card data-test-reset>
      <CardHeader>
        <CardTitle>{labels.heading}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline">{fill(labels.generation, { generation: String(generation) })}</Badge>
          <ConfirmDialog
            open={open}
            onOpenChange={(next) => {
              if (next) { setTarget(generation); setSuccess(null); }
              setOpen(next);
            }}
            trigger={<Button variant="destructive">{labels.open}</Button>}
            title={labels.title}
            description={fill(labels.confirmation, { generation: String(target) })}
            confirmLabel={labels.confirm}
            pendingLabel={labels.pending}
            cancelLabel={labels.cancel}
            destructive
            action={async () => {
              const result = await resetTest({ generation: target });
              if (result.ok) setSuccess(fill(labels.success, { generation: String(result.data.generation), state: result.data.readOnly ? labels.readOnly : labels.writable }));
              return result;
            }}
            formatError={(error) => errorMessage({ ...errors, ...labels.errors }, error)}
          />
        </div>
        <p className="text-sm text-muted-foreground">{readOnly ? labels.readOnly : labels.writable}</p>
        {success && <p role="status" className="text-sm">{success}</p>}
      </CardContent>
    </Card>
  );
}
