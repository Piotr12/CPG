import { QUANTITY_OUT_OF_RANGE_MESSAGE, QUANTITY_ROUNDS_TO_ZERO_MESSAGE, UNIT_NOT_CONVERTIBLE_MESSAGE } from "@cpg/core/validators/boms/bom-fields.schema";
import {
  ISSUE_LINE_COUNT_MESSAGE,
  ISSUE_LINE_SHIPMENT_MESSAGE,
  ISSUE_NO_SUCH_LINE_MESSAGE,
  ISSUE_QUANTITY_MESSAGE,
} from "@cpg/core/validators/goods-issues/goods-issue.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { DUPLICATE_LINE_MESSAGE, LINE_NUMBER_MESSAGE } from "@cpg/core/validators/purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";
import { errorFormatter, fill, shownQuantity } from "../forms/form-labels";

/** The goods-issue strings in the reader's language, all plain strings; `errors` holds every code the dialog can show. */
export type IssuesLabels = Omit<Messages["goodsIssues"], "errors"> & { errors: Record<string, string> };

/** Builds the goods-issue labels from a dictionary (server side, where `messages` is available). */
export function issuesLabels(messages: Messages): IssuesLabels {
  return { ...messages.goodsIssues, errors: { ...messages.errors, ...messages.goodsIssues.errors } };
}

export { errorFormatter, fill, shownQuantity };

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function issueFieldErrorFormatter(labels: IssuesLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
    [ISSUE_LINE_SHIPMENT_MESSAGE]: t.lineShipment,
    [ISSUE_NO_SUCH_LINE_MESSAGE]: t.noSuchLine,
    [ISSUE_QUANTITY_MESSAGE]: t.toIssue,
    [DUPLICATE_LINE_MESSAGE]: t.duplicateLine,
    [LINE_NUMBER_MESSAGE]: t.line,
    [ISSUE_LINE_COUNT_MESSAGE]: t.lines,
  };
  return (message: string): string => known[message] ?? message;
}
