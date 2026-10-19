"use client";

import { useState } from "react";
import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { Button } from "@cpg/ui/components/button";
import { setTenantReadOnly } from "../../app/admin/(global)/actions";
import { errorMessage } from "../../i18n/error-message";

/** One direction of the switch, filled in with the tenant's name on the server. */
export interface ReadOnlyChange {
  open: string;
  title: string;
  description: string;
  confirm: string;
}

export interface ReadOnlyControlsLabels {
  makeReadOnly: ReadOnlyChange;
  makeWritable: ReadOnlyChange;
  cancel: string;
  /** Error codes in the reader's language; others keep the server's text. */
  errors: Record<string, string>;
}

interface ReadOnlyControlsProps {
  tenant: TenantCode;
  readOnly: boolean;
  labels: ReadOnlyControlsLabels;
}

/**
 * The admin's button that makes a tenant read-only or writable again, behind a confirmation (R05).
 * The target is fixed when the confirmation opens: the page refreshes under the open dialog after a
 * change, and that must not turn "Make read-only" into "Make writable".
 */
export function ReadOnlyControls({ tenant, readOnly, labels }: ReadOnlyControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const [target, setTarget] = useState(!readOnly);
  const change = (makeReadOnly: boolean) => (makeReadOnly ? labels.makeReadOnly : labels.makeWritable);
  const confirm = change(target);

  return (
    <ConfirmDialog
      open={confirming}
      onOpenChange={(open) => {
        if (open) setTarget(!readOnly);
        setConfirming(open);
      }}
      trigger={<Button variant="outline">{change(!readOnly).open}</Button>}
      title={confirm.title}
      description={confirm.description}
      confirmLabel={confirm.confirm}
      cancelLabel={labels.cancel}
      destructive={target}
      action={() => setTenantReadOnly({ tenant, readOnly: target })}
      formatError={(error) => errorMessage(labels.errors, error)}
    />
  );
}
