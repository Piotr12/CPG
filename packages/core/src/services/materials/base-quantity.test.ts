import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initOrm, Material, MaterialConversion, selectTenant, type EntityManager, type Orm } from "@cpg/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../config";
import { migrateDatabase, toDbOptions } from "../../database";
import { convertToBaseQuantity, ENTERED_QUANTITY_MESSAGE } from "./base-quantity";

describe("convertToBaseQuantity", () => {
  let orm: Orm;
  let em: EntityManager;
  /** Prod's bolt (base unit each): 1 case = 12, 1 third = 1/3, and a factor too large to store. */
  let bolt: Material;

  beforeEach(async () => {
    const config = loadConfig({ DATA_DIR: mkdtempSync(path.join(tmpdir(), "cpg-base-quantity-")) });
    await migrateDatabase(config);
    orm = await initOrm(toDbOptions(config));
    em = orm.em.fork();
    selectTenant(em, "prod");
    bolt = em.create(Material, { code: "00000001", type: "raw", description: "Bolt M8", baseUnit: "each" });
    em.create(MaterialConversion, { material: bolt, unit: "case", numerator: "12", denominator: "1" });
    em.create(MaterialConversion, { material: bolt, unit: "third", numerator: "1", denominator: "3" });
    em.create(MaterialConversion, { material: bolt, unit: "huge", numerator: "999999999999", denominator: "0.000001" });
    // Another material's case holds 10: only the bolt's own conversion may count.
    const nut = em.create(Material, { code: "00000002", type: "raw", description: "Nut M8", baseUnit: "each" });
    em.create(MaterialConversion, { material: nut, unit: "case", numerator: "10", denominator: "1" });
    await em.flush();
    em.clear();
    bolt = await em.findOneOrFail(Material, { code: "00000001" });
  });
  afterEach(async () => {
    await orm.close();
  });

  it("takes a quantity in the base unit 1:1, keeping six decimals and a 1/1 factor", async () => {
    expect(await convertToBaseQuantity(em, bolt, { quantity: "0.123456", unit: "each" })).toEqual({
      baseQuantity: "0.123456",
      enteredQuantity: "0.123456",
      enteredUnit: "each",
      numerator: "1",
      denominator: "1",
    });
  });

  it("converts 2 case at 1 case = 12 each to 24 each, keeping the entered quantity, unit and factor", async () => {
    expect(await convertToBaseQuantity(em, bolt, { quantity: "2.0", unit: "case" })).toEqual({
      baseQuantity: "24.000000",
      enteredQuantity: "2",
      enteredUnit: "case",
      numerator: "12",
      denominator: "1",
    });
  });

  it("rounds a 1/3 factor half-up once, and stores zero entered as zero", async () => {
    expect(await convertToBaseQuantity(em, bolt, { quantity: "2", unit: "third" })).toMatchObject({
      baseQuantity: "0.666667",
      numerator: "1",
      denominator: "3",
    });
    expect(await convertToBaseQuantity(em, bolt, { quantity: "0", unit: "third" })).toMatchObject({ baseQuantity: "0.000000" });
  });

  it("refuses a unit the material has no conversion for, never assuming 1:1", async () => {
    await expect(convertToBaseQuantity(em, bolt, { quantity: "1", unit: "pallet" })).rejects.toMatchObject({
      code: "UNIT_NOT_CONVERTIBLE",
      message: "Material 00000001 has no conversion from pallet to its base unit each.",
    });
  });

  it("refuses a positive quantity that rounds to zero in the base unit", async () => {
    await expect(convertToBaseQuantity(em, bolt, { quantity: "0.000001", unit: "third" })).rejects.toMatchObject({
      code: "QUANTITY_ROUNDS_TO_ZERO",
      message: "That quantity is less than 0.000001 each.",
    });
  });

  it("refuses a base quantity too large to store", async () => {
    await expect(convertToBaseQuantity(em, bolt, { quantity: "1", unit: "huge" })).rejects.toMatchObject({
      code: "QUANTITY_OUT_OF_RANGE",
    });
  });

  it("refuses a malformed entered quantity on the quantity field", async () => {
    for (const quantity of ["-1", "1.0000001", "abc"]) {
      await expect(convertToBaseQuantity(em, bolt, { quantity, unit: "each" })).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        fieldErrors: { quantity: [ENTERED_QUANTITY_MESSAGE] },
      });
    }
  });
});
