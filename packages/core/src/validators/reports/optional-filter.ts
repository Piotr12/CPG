import { z } from "zod";

/**
 * A report filter as its form sends it: the "All" choice, or an empty date field, is an empty value,
 * which means no filter. Shared by the stock, variance and MRP reports, page and API alike.
 */
export const optionalFilter = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
