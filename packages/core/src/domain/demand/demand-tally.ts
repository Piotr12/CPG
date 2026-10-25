import type { DocumentState } from "@cpg/db";
import { outstandingQuantity } from "../document-lifecycle/lifecycle";
import { parseDecimal } from "../quantities/decimal";
import { bucketIndex, type DemandWindow } from "./demand-buckets";
import { netForecasts, type DemandForecast } from "./forecast-netting";

/** The figures of one bucket, in base micro-units (R03); the spec's Definitions name each. */
export interface DemandFigures {
  /** Goods issued with a business date in the bucket, a reversed line counting zero. */
  shipped: bigint;
  /** Ordered by required date, net of what was abandoned. */
  ordered: bigint;
  /** Still outstanding on Open lines, an overdue line counting today (DEM-012). */
  open: bigint;
  /** The part of `open` past its required date: only ever in today's bucket. */
  overdue: bigint;
  /** Forecast not yet ordered (D08). */
  forecast: bigint;
}

export const DEMAND_FIGURES = ["shipped", "ordered", "open", "overdue", "forecast"] as const satisfies readonly (keyof DemandFigures)[];

/** A goods-issue line: the material of its order line, at its order's location (SAL-004). */
export interface IssuedLine {
  material: string;
  location: string;
  businessDate: string;
  quantity: bigint;
  reversed: boolean;
}

/** A non-removed customer-order line, quantities as stored six-decimal texts. */
export interface DemandOrderLine {
  material: string;
  location: string;
  requiredDate: string;
  quantity: string;
  fulfilled: string;
  abandoned: string;
  status: DocumentState;
}

/** One material at one location: its figures per bucket of the window. */
export interface DemandCell {
  material: string;
  location: string;
  figures: DemandFigures[];
}

export interface DemandSources {
  issued: readonly IssuedLine[];
  /** Every line whose month a read forecast falls in, and every Open line due before today. */
  orderLines: readonly DemandOrderLine[];
  forecasts: readonly DemandForecast[];
}

export const zeroFigures = (): DemandFigures => ({ shipped: 0n, ordered: 0n, open: 0n, overdue: 0n, forecast: 0n });

/** The base figures of every material and location the sources mention, over `window`'s buckets. */
export function tallyDemand(window: DemandWindow, { issued, orderLines, forecasts }: DemandSources): DemandCell[] {
  const cells = new Map<string, DemandCell>();
  const add = (material: string, location: string, date: string, figure: keyof DemandFigures, amount: bigint) => {
    const index = bucketIndex(window, date);
    if (index === null || amount === 0n) return;
    const key = `${material}\u0000${location}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { material, location, figures: window.buckets.map(zeroFigures) };
      cells.set(key, cell);
    }
    cell.figures[index][figure] += amount;
  };
  const { today } = window;
  for (const line of issued) if (!line.reversed) add(line.material, line.location, line.businessDate, "shipped", line.quantity);
  const consuming = orderLines.map((line) => ({ ...line, quantity: parseDecimal(line.quantity)!, abandoned: parseDecimal(line.abandoned)! }));
  for (const line of consuming) {
    add(line.material, line.location, line.requiredDate, "ordered", line.quantity - line.abandoned);
  }
  for (const line of orderLines) {
    if (line.status !== "open") continue;
    const open = parseDecimal(outstandingQuantity(line.quantity, line.fulfilled, line.abandoned))!;
    const overdue = line.requiredDate < today;
    add(line.material, line.location, overdue ? today : line.requiredDate, "open", open);
    if (overdue) add(line.material, line.location, today, "overdue", open);
  }
  for (const { forecast, residual, placedOn } of netForecasts(forecasts, consuming, today)) {
    if (placedOn !== null) add(forecast.material, forecast.location, placedOn, "forecast", residual);
  }
  return [...cells.values()];
}
