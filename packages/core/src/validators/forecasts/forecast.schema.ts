import { z } from "zod";
import { calendarDateSchema } from "../dates/calendar-date.schema";
import { unitSchema } from "../materials/material-fields.schema";
import { locationReferenceSchema, materialReferenceSchema } from "../planning-parameters/planning-parameter-fields.schema";
import { quantitySchema } from "../quantities/quantity.schema";
import { pageSchema } from "../shipments/shipment.schema";
import { versionSchema } from "../version.schema";

/**
 * The unit a quantity is entered in. Left out or blank, it is the material's base unit; the form
 * sends a blank field as an empty string.
 */
const enteredUnitSchema = z
  .string()
  .trim()
  .transform((text) => (text === "" ? undefined : text))
  .pipe(unitSchema.optional())
  .optional();

/**
 * A new forecast (DEM-001): the Add forecast form, its action and `POST /api/tenants/{tenant}/forecasts`
 * share it. The quantity is a decimal string of at least 0 in `unit`, converted to the material's
 * base unit when stored (R03); the date is ISO `YYYY-MM-DD`. No customer is named.
 */
export const forecastCreateSchema = z.object({
  material: materialReferenceSchema,
  location: locationReferenceSchema,
  date: calendarDateSchema,
  quantity: quantitySchema,
  unit: enteredUnitSchema,
});

export type ForecastCreateInput = z.infer<typeof forecastCreateSchema>;

/** `PATCH …/forecasts/{material}/{location}/{date}`: a new quantity at a version. */
export const forecastChangeBodySchema = z.object({ quantity: quantitySchema, unit: enteredUnitSchema, version: versionSchema });

/** The Change forecast form's own fields. */
export const forecastChangeFormSchema = forecastChangeBodySchema.omit({ version: true });

/** `DELETE …/forecasts/{material}/{location}/{date}`: the version the client loaded. */
export const forecastRemoveBodySchema = z.object({ version: versionSchema });

/** The forecast the page binds to a change or a removal: its key and the version it loaded. */
const row = z.object({
  material: materialReferenceSchema,
  location: locationReferenceSchema,
  date: calendarDateSchema,
  version: versionSchema,
});

/** The `changeForecast` action: the form's quantity and unit plus the bound row. */
export const forecastChangeSchema = forecastChangeFormSchema.extend(row.shape);

/** The `removeForecast` action: the bound row. */
export const forecastRemoveSchema = row;

/**
 * The list's filter, from `?material=&location=`: each is a business ID, or blank for any. A form
 * sends a blank field, so an empty string means no filter on that field.
 */
const optionalReference = (schema: z.ZodString) =>
  z
    .string()
    .trim()
    .transform((text) => (text === "" ? undefined : text))
    .pipe(schema.optional())
    .optional();

export const forecastFilterSchema = z.object({
  material: optionalReference(materialReferenceSchema),
  location: optionalReference(locationReferenceSchema),
});

export type ForecastFilter = z.infer<typeof forecastFilterSchema>;

/**
 * `GET /api/tenants/{tenant}/forecasts`: the filter and a 1-based `page` of 100 (`DOCUMENT_PAGE_SIZE`),
 * the first when left out.
 */
export const forecastListQuerySchema = forecastFilterSchema.extend({ page: pageSchema });
