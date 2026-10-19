import { describe, expect, it } from "vitest";
import { userPreferenceUpdateSchema } from "./user-preference-update.schema";

describe("userPreferenceUpdateSchema", () => {
  it.each([[{ locale: "pl" }], [{ theme: "dark" }], [{ locale: "en", theme: "light" }]])("accepts %j", (input) => {
    expect(userPreferenceUpdateSchema.parse(input)).toEqual(input);
  });

  it("strips anything else, such as another account's id", () => {
    expect(userPreferenceUpdateSchema.parse({ locale: "pl", userId: "someone-else" })).toEqual({ locale: "pl" });
  });

  it("refuses an empty change", () => {
    const result = userPreferenceUpdateSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Choose a language or a theme.");
  });

  it.each([[{ locale: "de" }], [{ theme: "sepia" }]])("refuses %j", (input) => {
    expect(userPreferenceUpdateSchema.safeParse(input).success).toBe(false);
  });
});
