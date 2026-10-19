import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { readOnlyControlsLabels } from "./read-only-labels";

describe("readOnlyControlsLabels", () => {
  it("names the tenant in both directions", () => {
    const labels = readOnlyControlsLabels(en, "Prod");

    expect(labels.makeReadOnly).toEqual({
      open: "Make Prod read-only",
      title: "Make Prod read-only?",
      description:
        "Nobody, the administrator included, can change Prod's business data until it is made writable again. Reading, the audit and account settings keep working.",
      confirm: "Make read-only",
    });
    expect(labels.makeWritable).toMatchObject({ open: "Make Prod writable", confirm: "Make writable" });
    expect(labels.cancel).toBe("Cancel");
  });

  it("says this card's errors over the shared ones, in the reader's language", () => {
    const labels = readOnlyControlsLabels(pl, "Test");

    expect(labels.makeReadOnly.open).toBe("Ustaw Test tylko do odczytu");
    expect(labels.errors.FORBIDDEN).toBe("Tylko administrator może zmieniać ustawienie tylko do odczytu.");
    expect(labels.errors.INTERNAL).toBe(pl.errors.INTERNAL);
  });
});
