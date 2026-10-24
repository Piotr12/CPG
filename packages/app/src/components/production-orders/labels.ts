import {
  FINISHED_COMPONENT_MESSAGE,
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import { UNIT_FORMAT_MESSAGE } from "@cpg/core/validators/materials/material-fields.schema";
import { MATERIAL_CHOICE_MESSAGE } from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import {
  COMPLETION_LINE_COUNT_MESSAGE,
  COMPLETION_MOVEMENTS_MESSAGE,
  DUPLICATE_COMPLETION_MATERIAL_MESSAGE,
  EXTRA_INPUT_QUANTITY_MESSAGE,
  INACTIVE_INPUT_MESSAGE,
  MISSING_COMPONENT_MESSAGE,
  OUTPUT_AS_INPUT_MESSAGE,
  SUBMISSION_REUSED_MESSAGE,
  UNKNOWN_INPUT_MESSAGE,
} from "@cpg/core/validators/production-orders/production-completion.schema";
import { POSITIVE_QUANTITY_MESSAGE, QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { fill } from "../../i18n/fill";
import type { AutocompleteLabels } from "@cpg/ui/backend/forms/autocomplete";
import type { Messages } from "../../i18n/messages/en";
import { materialPickerLabels } from "../materials/material-picker";

export type ProductionLabels = Messages["productionOrders"] & {
  errors: Record<string, string>;
  /** The output and added-input material pickers (#217). */
  picker: { labels: AutocompleteLabels; placeholder: string };
};
export function productionLabels(messages: Messages): ProductionLabels {
  return { ...messages.productionOrders, errors: { ...messages.errors, ...messages.productionOrders.errors },
    picker: { labels: materialPickerLabels(messages.lists), placeholder: messages.lists.materialPicker.placeholder } };
}
export function productionFieldError(labels: ProductionLabels) {
  const known: Record<string, string> = {
    [CALENDAR_DATE_MESSAGE]: labels.invalidDate,
    [UNIT_FORMAT_MESSAGE]: labels.invalidUnit,
    [POSITIVE_QUANTITY_MESSAGE]: labels.invalidQuantity,
    "The planned start must fit a four-digit calendar year.": labels.invalidStart,
    "The component requirement is too large to store.": labels.requirementOverflow,
    "The target cannot be less than the quantity already produced.": labels.belowProduced,
  };
  return (message: string) => known[message] ?? message;
}
/**
 * The Post completion form's field messages, from its schema and the completion service, in the reader's
 * language. A missing recipe component is named when the server sends it in `params.material` (#153).
 */
export function completionFieldError(labels: ProductionLabels) {
  const t = labels.completion.fieldErrors;
  const known: Record<string, string> = {
    [MISSING_COMPONENT_MESSAGE]: t.missingComponent,
    [UNKNOWN_INPUT_MESSAGE]: t.unknownInput,
    [MATERIAL_CHOICE_MESSAGE]: t.unknownInput,
    [INACTIVE_INPUT_MESSAGE]: t.inactiveInput,
    [OUTPUT_AS_INPUT_MESSAGE]: t.outputAsInput,
    [EXTRA_INPUT_QUANTITY_MESSAGE]: t.extraQuantity,
    [COMPLETION_MOVEMENTS_MESSAGE]: t.movements,
    [FINISHED_COMPONENT_MESSAGE]: t.finishedInput,
    [DUPLICATE_COMPLETION_MATERIAL_MESSAGE]: t.duplicate,
    [COMPLETION_LINE_COUNT_MESSAGE]: t.lineCount,
    [QUANTITY_MESSAGE]: t.quantity,
    [UNIT_NOT_CONVERTIBLE_MESSAGE]: t.unitNotConvertible,
    [QUANTITY_ROUNDS_TO_ZERO_MESSAGE]: t.roundsToZero,
    [QUANTITY_OUT_OF_RANGE_MESSAGE]: t.outOfRange,
    [SUBMISSION_REUSED_MESSAGE]: t.submission,
  };
  const production = productionFieldError(labels);
  return (message: string, params: Record<string, string> = {}) => {
    if (message === MISSING_COMPONENT_MESSAGE && Object.hasOwn(params, "material")) return fill(t.missingComponentNamed, { material: params.material });
    return known[message] ?? production(message);
  };
}
