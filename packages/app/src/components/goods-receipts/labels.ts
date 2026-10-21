import type { OrderView } from "@cpg/core";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import {
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { RECEIPT_LINE_COUNT_MESSAGE, RECEIPT_LINE_ORDER_MESSAGE } from "@cpg/core/validators/goods-receipts/goods-receipt.schema";
import { DUPLICATE_LINE_MESSAGE, LINE_NO_SUCH_LINE_MESSAGE, LINE_NUMBER_MESSAGE } from "@cpg/core/validators/purchasing/purchasing-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";
import { errorFormatter, fill, shownQuantity } from "../forms/form-labels";
import type { MaterialsById } from "../purchase-orders/labels";

/** The goods-receipt strings in the reader's language, all plain strings; `errors` holds every code the dialog can show. */
export type ReceiptsLabels = Omit<Messages["goodsReceipts"], "errors"> & { errors: Record<string, string> };

/** Builds the goods-receipt labels from a dictionary (server side, where `messages` is available). */
export function receiptsLabels(messages: Messages): ReceiptsLabels {
  return { ...messages.goodsReceipts, errors: { ...messages.errors, ...messages.goodsReceipts.errors } };
}

export { errorFormatter, fill, shownQuantity };

/** A field message from the shared schemas or the service in the reader's language; unknown ones pass through. */
export function fieldErrorFormatter(labels: ReceiptsLabels) {
  const t = labels.fieldErrors;
  const known: Record<string, string> = {
    [POSITIVE_QUANTITY_MESSAGE]: t.quantity,
    [UNIT_FORMAT_MESSAGE]: t.unit,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
    [RECEIPT_LINE_ORDER_MESSAGE]: t.lineOrder,
    [LINE_NO_SUCH_LINE_MESSAGE]: t.noSuchLine,
    [DUPLICATE_LINE_MESSAGE]: t.duplicateLine,
    [LINE_NUMBER_MESSAGE]: t.line,
    [RECEIPT_LINE_COUNT_MESSAGE]: t.lines,
  };
  return (message: string): string => known[message] ?? message;
}

/** One order line as the Post goods receipt form offers it: its number, what it is, what is outstanding and the units it takes. */
export interface ReceiptLineChoice {
  line: number;
  label: string;
  outstanding: string;
  /** The material's base unit first, then the units it converts. */
  units: string[];
}

/** Every line of `order`, each labelled with its material and outstanding quantity; a received line may still take an excess (BUY-015). */
export function receiptLineChoices(order: OrderView, materials: MaterialsById, units: Record<string, string[]>, labels: ReceiptsLabels): ReceiptLineChoice[] {
  return order.lines.filter(({ status }) => status === "open" || status === "completed").map(({ line, material, outstanding }) => {
    const { id, description, baseUnit } = materials.get(material)!;
    return {
      line,
      label: fill(labels.post.line, { line: String(line), material: `${id} ${description}` }),
      outstanding: fill(labels.post.outstanding, { outstanding: shownQuantity(outstanding), baseUnit }),
      units: units[material] ?? [baseUnit],
    };
  });
}
