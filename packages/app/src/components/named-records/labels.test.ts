import { NAME_REQUIRED_MESSAGE, NAME_TOO_LONG_MESSAGE } from "@cpg/core/validators/named-records/named-record-fields.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { fieldErrorFormatter, namedRecordsLabels } from "./labels";

describe("namedRecordsLabels", () => {
  it.each(["locations", "customers", "suppliers"] as const)("gives the %s screen plain strings, its own errors over the shared ones", (kind) => {
    const labels = namedRecordsLabels(en, kind);

    expect(labels).not.toHaveProperty("heading");
    expect(labels.link).toBe(en[kind].link);
    expect(labels.errors.VALIDATION_FAILED).toBe(en.errors.VALIDATION_FAILED);
    expect(labels.errors.FORBIDDEN).toBe(en[kind].errors.FORBIDDEN);
  });
});

describe("fieldErrorFormatter", () => {
  it("translates the name messages and passes unknown ones through", () => {
    const format = fieldErrorFormatter(namedRecordsLabels(pl, "customers"));

    expect(format(NAME_REQUIRED_MESSAGE)).toBe("Wpisz nazwę.");
    expect(format(NAME_TOO_LONG_MESSAGE)).toBe("Użyj najwyżej 100 znaków.");
    expect(format("Something else.")).toBe("Something else.");
  });
});
