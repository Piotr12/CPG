import {
  BOM_OUTPUT_IMMUTABLE_MESSAGE,
  COMPONENT_COUNT_MESSAGE,
  DUPLICATE_COMPONENT_MESSAGE,
  FINISHED_COMPONENT_MESSAGE,
  OUTPUT_CHOICE_MESSAGE,
  PRIORITY_MESSAGE,
  QUANTITY_OUT_OF_RANGE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  RAW_OUTPUT_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
  VALID_THROUGH_BEFORE_FROM_MESSAGE,
} from "@cpg/core/validators/boms/bom-fields.schema";
import { CALENDAR_DATE_MESSAGE } from "@cpg/core/validators/dates/calendar-date.schema";
import {
  ACTIVE_MESSAGE,
  BOM_TARGET_MESSAGE,
  ID_FORMAT_MESSAGE,
  REFERENCE_FORMAT_MESSAGE,
} from "@cpg/core/validators/imports/import-rows.schema";
import {
  PREVIEW_TOKEN_MESSAGE,
  WORKBOOK_INFLATES_TOO_MUCH_MESSAGE,
  WORKBOOK_REQUIRED_MESSAGE,
  WORKBOOK_TOO_LARGE_MESSAGE,
  WORKBOOK_TOO_MANY_CELLS_MESSAGE,
  WORKBOOK_TOO_MANY_ROWS_MESSAGE,
  WORKBOOK_UNREADABLE_MESSAGE,
} from "@cpg/core/validators/imports/import-request.schema";
import {
  DESCRIPTION_REQUIRED_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  FACTOR_MESSAGE,
  TYPE_MESSAGE,
  UNIT_FORMAT_MESSAGE,
} from "@cpg/core/validators/materials/material-fields.schema";
import { STATISTICAL_BASE_UNIT_MESSAGE, UNIT_NOT_REGISTERED_MESSAGE } from "@cpg/core/validators/units/unit-registry";
import { NAME_REQUIRED_MESSAGE, NAME_TOO_LONG_MESSAGE } from "@cpg/core/validators/named-records/named-record-fields.schema";
import {
  LEAD_TIME_MESSAGE,
  LOCATION_CHOICE_MESSAGE,
  MATERIAL_CHOICE_MESSAGE,
  PROCUREMENT_MESSAGE,
  RAW_MATERIAL_BUY_ONLY_MESSAGE,
} from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE, QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import type { Messages } from "../../i18n/messages/en";
import { bomsLabels, fieldErrorFormatter as bomFieldErrors } from "../boms/labels";
import { materialsLabels, fieldErrorFormatter as materialFieldErrors } from "../materials/labels";
import { namedRecordsLabels, fieldErrorFormatter as namedRecordFieldErrors } from "../named-records/labels";
import { planningParametersLabels, fieldErrorFormatter as planningFieldErrors } from "../planning-parameters/labels";
import { safetyStockLabels, fieldErrorFormatter as safetyStockFieldErrors } from "../safety-stock/labels";

/**
 * The Import screen's strings in the reader's language: plain strings, so they reach its client
 * component. A row's cell error comes as the English message of a shared schema or service: every
 * screen's translation of it is gathered here, server side, as `fieldMessages`.
 */
export type ImportLabels = Omit<Messages["imports"], "heading" | "errors" | "change"> & {
  /** `fields`: how a change's field is named when it isn't a workbook column (the stock import's Movement). */
  change: Messages["imports"]["change"] & { fields?: Record<string, string> };
  errors: Record<string, string>;
  fieldMessages: Record<string, string>;
  /** The commit's reason field, for an import that posts with one (the stock import). */
  reason?: Messages["stockImport"]["reason"];
};

/** Every field message a row can carry: each screen translates its own. */
const SCREEN_MESSAGES = [
  TYPE_MESSAGE,
  DESCRIPTION_REQUIRED_MESSAGE,
  DESCRIPTION_TOO_LONG_MESSAGE,
  UNIT_FORMAT_MESSAGE,
  UNIT_NOT_REGISTERED_MESSAGE,
  STATISTICAL_BASE_UNIT_MESSAGE,
  FACTOR_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  MATERIAL_CHOICE_MESSAGE,
  LOCATION_CHOICE_MESSAGE,
  PROCUREMENT_MESSAGE,
  RAW_MATERIAL_BUY_ONLY_MESSAGE,
  LEAD_TIME_MESSAGE,
  QUANTITY_MESSAGE,
  POSITIVE_QUANTITY_MESSAGE,
  CALENDAR_DATE_MESSAGE,
  OUTPUT_CHOICE_MESSAGE,
  PRIORITY_MESSAGE,
  VALID_THROUGH_BEFORE_FROM_MESSAGE,
  COMPONENT_COUNT_MESSAGE,
  DUPLICATE_COMPONENT_MESSAGE,
  RAW_OUTPUT_MESSAGE,
  FINISHED_COMPONENT_MESSAGE,
  UNIT_NOT_CONVERTIBLE_MESSAGE,
  QUANTITY_ROUNDS_TO_ZERO_MESSAGE,
  QUANTITY_OUT_OF_RANGE_MESSAGE,
];

/** Builds the Import screen's labels from a dictionary (server side, where `messages` is available). */
export function importLabels(messages: Messages): ImportLabels {
  const formatters = [
    materialFieldErrors(materialsLabels(messages)),
    namedRecordFieldErrors(namedRecordsLabels(messages, "locations")),
    planningFieldErrors(planningParametersLabels(messages)),
    safetyStockFieldErrors(safetyStockLabels(messages)),
    bomFieldErrors(bomsLabels(messages)),
  ];
  const translated = (message: string) => formatters.map((format) => format(message)).find((text) => text !== message) ?? message;
  const own = messages.imports.fieldErrors;
  const fieldMessages: Record<string, string> = {
    ...Object.fromEntries(SCREEN_MESSAGES.map((message) => [message, translated(message)])),
    [ID_FORMAT_MESSAGE]: own.id,
    [ACTIVE_MESSAGE]: own.active,
    [REFERENCE_FORMAT_MESSAGE]: own.reference,
    [BOM_TARGET_MESSAGE]: own.bomTarget,
    [BOM_OUTPUT_IMMUTABLE_MESSAGE]: own.outputImmutable,
    [WORKBOOK_REQUIRED_MESSAGE]: own.workbookRequired,
    [WORKBOOK_TOO_LARGE_MESSAGE]: own.workbookTooLarge,
    [WORKBOOK_UNREADABLE_MESSAGE]: own.workbookUnreadable,
    [WORKBOOK_TOO_MANY_ROWS_MESSAGE]: own.workbookTooManyRows,
    [WORKBOOK_INFLATES_TOO_MUCH_MESSAGE]: own.workbookInflatesTooMuch,
    [WORKBOOK_TOO_MANY_CELLS_MESSAGE]: own.workbookTooManyCells,
    [PREVIEW_TOKEN_MESSAGE]: own.previewToken,
  };
  const labels: Partial<Messages["imports"]> = { ...messages.imports };
  delete labels.heading;
  delete labels.errors;
  return {
    ...(labels as Omit<Messages["imports"], "heading" | "errors">),
    errors: {
      ...messages.errors,
      ...messages.materials.errors,
      ...messages.planningParameters.errors,
      ...messages.safetyStock.errors,
      ...messages.boms.errors,
      ...messages.imports.errors,
    },
    fieldMessages,
  };
}
