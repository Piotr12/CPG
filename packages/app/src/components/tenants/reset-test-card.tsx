"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@cpg/ui/backend/dialogs/confirm-dialog";
import { Badge } from "@cpg/ui/components/badge";
import { Button } from "@cpg/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cpg/ui/components/card";
import { Label } from "@cpg/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@cpg/ui/components/native-select";
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

/** Test's datasets as the card offers them, tiny (the default) first (spec `2026-10-22--0902UTC-test-tenant-two-datasets`). */
type Dataset = keyof Messages["admin"]["reset"]["datasets"];
const DATASETS: readonly Dataset[] = ["tiny", "realistic"];

/**
 * Admin control for Test only. An open confirmation never silently changes its target generation or
 * dataset: both are the ones shown when it opened.
 */
export function ResetTestCard({ generation, readOnly, labels, errors }: Props) {
  const datasetId = useId();
  const [open, setOpen] = useState(false);
  const [dataset, setDataset] = useState<Dataset>("tiny");
  const [target, setTarget] = useState({ generation, dataset });
  const [success, setSuccess] = useState<string | null>(null);
  const confirmation = fill(labels.confirmation, { generation: String(target.generation), dataset: labels.datasetNames[target.dataset] });
  return (
    <Card data-test-reset>
      <CardHeader>
        <CardTitle>{labels.heading}</CardTitle>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline">{fill(labels.generation, { generation: String(generation) })}</Badge>
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={datasetId}>{labels.dataset}</Label>
            <NativeSelect id={datasetId} value={dataset} onChange={(event) => setDataset(event.target.value as Dataset)}>
              {DATASETS.map((each) => <NativeSelectOption key={each} value={each}>{labels.datasets[each]}</NativeSelectOption>)}
            </NativeSelect>
            <ConfirmDialog
              open={open}
              onOpenChange={(next) => {
                if (next) { setTarget({ generation, dataset }); setSuccess(null); }
                setOpen(next);
              }}
              trigger={<Button variant="destructive">{labels.open}</Button>}
              title={labels.title}
              description={target.dataset === "realistic" ? `${confirmation} ${labels.slow}` : confirmation}
              confirmLabel={labels.confirm}
              pendingLabel={labels.pending}
              cancelLabel={labels.cancel}
              destructive
              action={async () => {
                const result = await resetTest(target);
                if (result.ok) setSuccess(fill(labels.success, { generation: String(result.data.generation), state: result.data.readOnly ? labels.readOnly : labels.writable }));
                return result;
              }}
              formatError={(error) => errorMessage({ ...errors, ...labels.errors }, error)}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{readOnly ? labels.readOnly : labels.writable}</p>
        {success && <p role="status" className="text-sm">{success}</p>}
      </CardContent>
    </Card>
  );
}
