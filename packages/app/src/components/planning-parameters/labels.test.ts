import { describe, expect, it } from "vitest";
import {
  LEAD_TIME_MESSAGE,
  RAW_MATERIAL_BUY_ONLY_MESSAGE,
} from "@cpg/core/validators/planning-parameters/planning-parameter-fields.schema";
import { POSITIVE_QUANTITY_MESSAGE } from "@cpg/core/validators/quantities/quantity.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { fieldErrorFormatter, planningParametersLabels } from "./labels";

describe("planningParametersLabels", () => {
  it("drops the server-side heading and merges the screen's errors over the shared ones", () => {
    const labels = planningParametersLabels(en);
    expect(labels).not.toHaveProperty("heading");
    expect(labels.errors.PLANNING_PARAMETERS_EXIST).toBe(en.planningParameters.errors.PLANNING_PARAMETERS_EXIST);
    expect(labels.errors.TENANT_READ_ONLY).toBe(en.errors.TENANT_READ_ONLY);
  });
});

describe("fieldErrorFormatter", () => {
  it("translates the schemas' and the service's messages, and passes unknown ones through", () => {
    const format = fieldErrorFormatter(planningParametersLabels(pl));
    expect(format(RAW_MATERIAL_BUY_ONLY_MESSAGE)).toBe("Surowiec jest zawsze kupowany: wybierz Zakup.");
    expect(format(LEAD_TIME_MESSAGE)).toBe(pl.planningParameters.fieldErrors.leadTime);
    expect(format(POSITIVE_QUANTITY_MESSAGE)).toBe(pl.planningParameters.fieldErrors.positiveQuantity);
    expect(format("Something new.")).toBe("Something new.");
  });

  it("keeps the English messages equal to the schemas' own", () => {
    const format = fieldErrorFormatter(planningParametersLabels(en));
    for (const message of [RAW_MATERIAL_BUY_ONLY_MESSAGE, LEAD_TIME_MESSAGE, POSITIVE_QUANTITY_MESSAGE]) {
      expect(format(message)).toBe(message);
    }
  });
});
