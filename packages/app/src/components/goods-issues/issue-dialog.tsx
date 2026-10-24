"use client";

import { useState } from "react";
import type { IssueView } from "@cpg/core";
import { issueFormSchema } from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { Button } from "@cpg/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@cpg/ui/components/dialog";
import { postIssue } from "../../app/admin/[tenant]/shipments/[id]/actions";
import { TALL_DIALOG, type TenantContext } from "../forms/form-labels";
import { LineQuantitiesForm, type LineQuantityChoice } from "../forms/line-quantities-form";
import { errorFormatter, fill, issueFieldErrorFormatter, type IssuesLabels } from "./labels";

interface IssueDialogProps {
  context: TenantContext;
  /** The shipment the page shows; every issue from here is against it. */
  shipment: string;
  /** Its order, whose page the issue refreshes. */
  customerOrder: string;
  /** Where the stock falls, as the dialog says it. */
  location: string;
  labels: IssuesLabels;
  /** The shipment's lines with anything to issue. */
  lines: LineQuantityChoice[];
  /** Whether the shipment takes issues (it is Open). A post that completes it hides the button, never the notice. */
  canPost: boolean;
}

/** The Post goods issue button and its form, for any signed-in account. After a post, the dialog closes and a notice names the issue. */
export function IssueDialog({ context, shipment, customerOrder, location, labels, lines, canPost }: IssueDialogProps) {
  const [open, setOpen] = useState(false);
  const [posted, setPosted] = useState<IssueView | null>(null);
  const close = () => setOpen(false);
  const t = labels.post;

  return (
    <div className="flex flex-col items-start gap-3">
      {canPost && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setPosted(null)}>{t.open}</Button>
          </DialogTrigger>
          <DialogContent className={`sm:max-w-3xl ${TALL_DIALOG}`}>
            <DialogHeader>
              <DialogTitle>{t.title}</DialogTitle>
              <DialogDescription>{fill(t.description, { location })}</DialogDescription>
            </DialogHeader>
            <LineQuantitiesForm
              labels={t}
              keyName="line"
              lines={lines}
              schema={issueFormSchema}
              formatError={errorFormatter(labels)}
              formatFieldError={issueFieldErrorFormatter(labels)}
              action={(values) => postIssue(context.tenant, context.generation, shipment, customerOrder, values)}
              onSuccess={(issue) => {
                setPosted(issue);
                close();
              }}
              onCancel={close}
            />
          </DialogContent>
        </Dialog>
      )}
      {posted && (
        <Callout
          tone="success"
          role="status"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setPosted(null)}>
              {labels.dismiss}
            </Button>
          }
        >
          {fill(labels.posted, { id: posted.id })}
        </Callout>
      )}
    </div>
  );
}
