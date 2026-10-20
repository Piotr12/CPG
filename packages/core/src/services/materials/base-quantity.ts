import { MaterialConversion, type EntityManager, type Material } from "@cpg/db";
import { convertToBase, formatDecimal, MAX_QUANTITY, parseDecimal } from "../../domain/quantities/decimal";
import { AppError, ValidationError } from "../../http/errors";

/**
 * An entered quantity converted into the material's base unit (materials spec Q5): the six-decimal
 * base quantity that is authoritative, and the entered quantity, unit and factor that history keeps
 * (MAT-019). BOM lines and, later, documents store this record as it is.
 */
export interface BaseQuantity {
  baseQuantity: string;
  enteredQuantity: string;
  enteredUnit: string;
  numerator: string;
  denominator: string;
}

/** What the conversion says about a malformed entered quantity, on `quantity`. */
export const ENTERED_QUANTITY_MESSAGE = "Enter a number of at least 0, with at most 6 decimals.";

/**
 * `quantity` entered in `unit`, in `material`'s base unit: the base unit itself 1:1, another unit
 * through its conversion, rounded half-up once to six decimals (MAT-019…024, MAT-032). A unit without
 * a conversion is never assumed 1:1 (MAT-023). A leaf function, so the BOM service converts lines
 * the same way without importing `MaterialService`. `em` must be scoped to the material's tenant.
 */
export async function convertToBaseQuantity(
  em: EntityManager,
  material: Material,
  { quantity, unit }: { quantity: string; unit: string },
): Promise<BaseQuantity> {
  const entered = parseDecimal(quantity);
  if (entered === null) throw new ValidationError({ quantity: [ENTERED_QUANTITY_MESSAGE] });
  const factor =
    unit === material.baseUnit ? { numerator: "1", denominator: "1" } : await em.findOne(MaterialConversion, { material, unit });
  if (!factor) {
    throw new AppError(
      "UNIT_NOT_CONVERTIBLE",
      `Material ${material.code} has no conversion from ${unit} to its base unit ${material.baseUnit}.`,
    );
  }
  const base = convertToBase(entered, parseDecimal(factor.numerator)!, parseDecimal(factor.denominator)!);
  if (base > MAX_QUANTITY) {
    throw new AppError("QUANTITY_OUT_OF_RANGE", "That quantity is too large to store in the base unit.");
  }
  if (entered > 0n && base === 0n) {
    throw new AppError("QUANTITY_ROUNDS_TO_ZERO", `That quantity is less than 0.000001 ${material.baseUnit}.`);
  }
  return {
    baseQuantity: formatDecimal(base, { fixed: true }),
    enteredQuantity: formatDecimal(entered),
    enteredUnit: unit,
    numerator: factor.numerator,
    denominator: factor.denominator,
  };
}
