"use client";

import { useState } from "react";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { ErrorMessage } from "@cpg/ui/backend/feedback/error-message";
import { Button } from "@cpg/ui/components/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@cpg/ui/components/dialog";
import { Input } from "@cpg/ui/components/input";
import { Label } from "@cpg/ui/components/label";
import { withName, type TokensLabels } from "./labels";

interface TokenSecretPanelProps {
  name: string;
  secret: string;
  labels: TokensLabels;
  onDone: () => void;
}

/** The one time a token's secret is shown: copy it now, CPG keeps only its hash (API-006). */
export function TokenSecretPanel({ name, secret, labels, onDone }: TokenSecretPanelProps) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const t = labels.secret;

  async function copySecret() {
    try {
      // `navigator.clipboard` is missing outside a secure context; that fails here too.
      await navigator.clipboard.writeText(secret);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{withName(t.title, name)}</DialogTitle>
        <DialogDescription>{t.usage}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="api-token-secret">{t.label}</Label>
        <div className="flex gap-2">
          <Input
            id="api-token-secret"
            readOnly
            value={secret}
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" variant="outline" onClick={copySecret}>
            {copy === "copied" ? t.copied : t.copy}
          </Button>
        </div>
        {copy === "failed" && <ErrorMessage>{t.copyFailed}</ErrorMessage>}
      </div>
      <Callout tone="warning" title={t.warningTitle}>
        {t.warning}
      </Callout>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t.done}
        </Button>
      </DialogFooter>
    </>
  );
}
