import { listSortSchema } from "../lists/list-query.schema";

/**
 * The columns the Forecasts list sorts by (#217); the first is its default order. The quantity sorts
 * by its value, not its six-decimal text (#224).
 */
export const FORECAST_SORTS = ["material", "location", "date", "quantity"] as const;
export type ForecastSort = (typeof FORECAST_SORTS)[number];

export const forecastSortSchema = listSortSchema(FORECAST_SORTS);
