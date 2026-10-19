"use client";

import { useState } from "react";
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
  const [copied, setCopied] = useState(false);
  const t = labels.secret;

  async function copy() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
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
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? t.copied : t.copy}
          </Button>
        </div>
      </div>
      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
        {t.warning}
      </p>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t.done}
        </Button>
      </DialogFooter>
    </>
  );
}
