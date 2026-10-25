import { listQueryShape, listSortSchema } from "../lists/list-query.schema";
import { forecastListQuerySchema } from "./forecast.schema";

/**
 * The columns the Forecasts list sorts by (#217); the first is its default order. The quantity is
 * six-decimal text, so it isn't one (it would sort as text).
 */
export const FORECAST_SORTS = ["material", "location", "date"] as const;
export type ForecastSort = (typeof FORECAST_SORTS)[number];

export const forecastSortSchema = listSortSchema(FORECAST_SORTS);

/** `GET /api/tenants/{tenant}/forecasts`'s query (#221): an optional search and sort besides its `material`, `location` and `page`; other keys are ignored, as before. */
export const forecastApiQuerySchema = forecastListQuerySchema.extend(listQueryShape(FORECAST_SORTS));
