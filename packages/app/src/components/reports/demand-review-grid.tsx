"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "@cpg/ui/lib/utils";
import { EmptyState } from "@cpg/ui/backend/feedback/empty-state";
import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@cpg/ui/components/table";
import type { GridLine } from "./demand-review-view";

/** A column of the grid: one bucket of the window. */
export interface GridBucket {
  key: string;
  label: string;
  title: string;
  past: boolean;
  current: boolean;
}

/** The grid's words, plain strings so the server can pass them. */
export interface DemandReviewGridLabels {
  /** The table's name and its scroll region's. */
  label: string;
  caption: string;
  /** "Product" or "Location". */
  rows: string;
  total: string;
  totalRow: string;
  details: Record<GridLine["details"][number]["figure"], string>;
  /** A row's disclosure button: "Details of {name}". */
  toggle: string;
  empty: string;
}

interface DemandReviewGridProps {
  buckets: GridBucket[];
  lines: GridLine[];
  total: GridLine;
  labels: DemandReviewGridLabels;
}

const STICKY = "sticky left-0 z-10 bg-background";
/** Row names wrap on a phone, so the sticky column leaves room for the figures. */
const NAME = "min-w-36 max-w-44 whitespace-normal sm:max-w-none sm:whitespace-nowrap";
/** Past columns are tinted; today's column carries a rule on both sides. */
const columnTone = ({ past, current }: GridBucket) => cn("text-right tabular-nums", past && "bg-muted", current && "border-x-2 border-foreground");
/** A figure the screen formats as "–" is zero. */
const ZERO = "–";

/**
 * The demand review's numbers (#240): products (or one product's locations) by bucket, shipped in
 * tinted past columns and still to ship in the white ones, each row opening its open orders, overdue
 * part and forecast not yet ordered. It opens scrolled to today's column.
 */
export function DemandReviewGrid({ buckets, lines, total, labels }: DemandReviewGridProps) {
  const table = useRef<HTMLTableElement>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const container = table.current?.parentElement;
    const current = table.current?.querySelector<HTMLElement>("th[data-current]");
    const first = table.current?.querySelector<HTMLElement>("th");
    if (!container || !current || !first) return;
    container.scrollLeft = Math.max(0, current.offsetLeft - first.offsetWidth);
  }, []);

  if (lines.length === 0) return <EmptyState title={labels.empty} />;
  const toggle = (key: string) =>
    setOpen((previous) => {
      const next = new Set(previous);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <Table ref={table} aria-label={labels.label} scrollLabel={labels.label}>
      <TableCaption>{labels.caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={STICKY}>{labels.rows}</TableHead>
          {buckets.map((bucket) => (
            <TableHead key={bucket.key} scope="col" title={bucket.title} data-current={bucket.current || undefined} className={columnTone(bucket)}>
              {bucket.label}
            </TableHead>
          ))}
          <TableHead scope="col" className="text-right">{labels.total}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => {
          const expanded = open.has(line.key);
          return (
            <Fragment key={line.key}>
              <TableRow data-grid-row={line.key}>
                <TableHead scope="row" className={cn(STICKY, NAME, "font-normal")}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={labels.toggle.replace("{name}", line.name)}
                    onClick={() => toggle(line.key)}
                    className="flex items-center gap-1 text-left"
                  >
                    <ChevronRightIcon aria-hidden className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-90")} />
                    <span>{line.name}</span>
                  </button>
                </TableHead>
                {line.cells.map((cell, index) => <TableCell key={buckets[index].key} className={columnTone(buckets[index])}>{cell}</TableCell>)}
                <TableCell className="text-right font-medium tabular-nums">{line.total}</TableCell>
              </TableRow>
              {expanded &&
                line.details.map((detail) => (
                  <TableRow key={detail.figure} data-grid-detail={detail.figure} className="text-muted-foreground">
                    <TableHead scope="row" className={cn(STICKY, NAME, "pl-8 font-normal")}>{labels.details[detail.figure]}</TableHead>
                    {detail.cells.map((cell, index) => (
                      <TableCell key={buckets[index].key} className={columnTone(buckets[index])}>
                        {detail.figure === "overdue" && cell !== ZERO ? (
                          <span className="inline-flex items-center gap-1 text-warning">
                            <TriangleAlertIcon aria-hidden className="size-3.5" />
                            {cell}
                          </span>
                        ) : (
                          cell
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{detail.total}</TableCell>
                  </TableRow>
                ))}
            </Fragment>
          );
        })}
      </TableBody>
      <TableFooter>
        <TableRow data-grid-total>
          <TableHead scope="row" className={STICKY}>{labels.totalRow}</TableHead>
          {total.cells.map((cell, index) => <TableCell key={buckets[index].key} className={cn(columnTone(buckets[index]), "font-medium")}>{cell}</TableCell>)}
          <TableCell className="text-right font-medium tabular-nums">{total.total}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
