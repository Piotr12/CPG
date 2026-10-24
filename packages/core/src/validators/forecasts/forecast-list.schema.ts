import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the Forecasts list sorts by (#217); the first is its default order. The quantity is
 * six-decimal text, so it isn't one (it would sort as text).
 */
export const FORECAST_SORTS = ["material", "location", "date"] as const;
export type ForecastSort = (typeof FORECAST_SORTS)[number];

export const forecastSortSchema = listSortSchema(FORECAST_SORTS);
