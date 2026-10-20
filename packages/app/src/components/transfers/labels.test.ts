import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { byId, fieldErrorFormatter, isPositive, locationName, materialName, transfersLabels } from "./labels";

describe("transfer labels", () => {
  it("hold plain data only, with the screen's error codes over the shared ones", () => {
    const labels = transfersLabels(pl);
    expect(["heading", "detailHeading"].filter((key) => key in labels)).toEqual([]);
    expect(Object.values(labels).some((value) => typeof value === "function")).toBe(false);
    expect(labels.errors.TRANSFER_NOT_FOUND).toBe(pl.transfers.errors.TRANSFER_NOT_FOUND);
    expect(labels.errors.INSUFFICIENT_STOCK).toBe(pl.errors.INSUFFICIENT_STOCK);
  });

  it("translate the shared schemas' field messages and pass unknown ones through", () => {
    const format = fieldErrorFormatter(transfersLabels(en));
    expect(format("The destination must be another location than the source.")).toBe(en.transfers.fieldErrors.sameLocation);
    expect(format("Enter a reason, up to 500 characters.")).toBe(en.transfers.fieldErrors.reason);
    expect(format("Something else.")).toBe("Something else.");
  });

  it("name records by ID and tell a positive quantity from zero", () => {
    const locations = byId([{ id: "00000001", name: "Main plant", active: true, createdAt: new Date(), version: 1 }]);
    const materials = byId([{ id: "00000002", type: "raw" as const, description: "Steel", baseUnit: "kg", active: true, createdAt: new Date(), version: 1 }]);
    expect(locationName(locations, "00000001")).toBe("00000001 Main plant");
    expect(materialName(materials, "00000002")).toBe("00000002 Steel");
    expect(isPositive("0.000000")).toBe(false);
    expect(isPositive("0.000001")).toBe(true);
    expect(isPositive("40.000000")).toBe(true);
  });
});
