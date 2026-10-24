import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { plural, pluralForm } from "./plural";

describe("plural", () => {
  it("chooses Polish's one, few and other forms, 12–14 included", () => {
    expect([1, 2, 5, 12, 22, 25].map(pluralForm)).toEqual(["one", "few", "other", "other", "few", "other"]);
    expect([0, 4, 11, 13, 14, 21, 104, 112].map(pluralForm)).toEqual(["other", "few", "other", "other", "other", "other", "few", "other"]);
  });

  it("names the components short in both languages", () => {
    const counts = [1, 2, 5, 12, 22, 25];
    expect(counts.map((count) => plural(pl.productionOrders.shortageTitle, count))).toEqual([
      "1 składnik z niedoborem", "2 składniki z niedoborem", "5 składników z niedoborem",
      "12 składników z niedoborem", "22 składniki z niedoborem", "25 składników z niedoborem",
    ]);
    expect(counts.map((count) => plural(en.productionOrders.shortageTitle, count))).toEqual([
      "1 component short", "2 components short", "5 components short", "12 components short", "22 components short", "25 components short",
    ]);
  });
});
