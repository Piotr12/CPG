import Link from "next/link";
import type { BomDetail, BomRevisionView, Locale, MaterialSummary } from "@cpg/core";
import { DataTable, type DataTableColumn } from "@cpg/ui/backend/tables/data-table";
import { Badge } from "@cpg/ui/components/badge";
import { Card, CardContent } from "@cpg/ui/components/card";
import type { Messages } from "../../i18n/messages/en";
import { BomControls } from "./bom-controls";
import { componentChoices } from "./choices";
import { bomsLabels, fill, materialsById, validityText } from "./labels";
import { RecipeTable } from "./recipe-table";

interface BomScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  bom: BomDetail;
  /** An older revision to show instead of the current one (`?revision=N`), read-only. */
  historic: BomRevisionView | null;
  materials: MaterialSummary[];
  units: Record<string, string[]>;
  locale: Locale;
  messages: Messages;
  /** Only the admin gets the controls (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
}

type RevisionRow = BomDetail["revisions"][number];

/**
 * The body of a BOM's page: its details, the recipe of the current revision (or of an older one,
 * under a notice saying it is history, BOM-020), every revision newest first, and the admin's
 * controls.
 */
export function BomScreen({ tenant, bom, historic, materials, units, locale, messages, admin }: BomScreenProps) {
  const labels = bomsLabels(messages);
  const byId = materialsById(materials);
  const output = byId.get(bom.output)!;
  const editable = admin && !tenant.readOnly;
  const path = `/admin/${tenant.code}/boms/${bom.id}`;
  const shown = historic ?? { number: bom.revision, components: bom.components };
  const recipeHeading = fill(labels.recipe.heading, { number: String(shown.number) });
  const t = labels.details;
  const details = [
    {
      label: t.output,
      value: (
        <Link href={`/admin/${tenant.code}/materials/${output.id}`} className="underline underline-offset-4">
          {output.id} {output.description} ({output.baseUnit})
        </Link>
      ),
    },
    {
      label: t.status,
      value: <Badge variant={bom.active ? "secondary" : "destructive"}>{labels.status[bom.active ? "active" : "inactive"]}</Badge>,
    },
    { label: t.revision, value: fill(labels.revisionShort, { number: String(bom.revision) }) },
    { label: t.priority, value: String(bom.priority) },
    { label: t.valid, value: validityText(bom, t.noEnd) },
    { label: t.created, value: bom.createdAt.toISOString().slice(0, 10) },
  ];
  const revisionColumns: DataTableColumn<RevisionRow>[] = [
    {
      id: "number",
      header: labels.revisions.columns.number,
      cell: (revision) => (
        <span className="flex items-center gap-2">
          <Link href={revision.number === bom.revision ? path : `${path}?revision=${revision.number}`} className="underline underline-offset-4">
            {fill(labels.revisionShort, { number: String(revision.number) })}
          </Link>
          {revision.number === bom.revision && <Badge variant="outline">{labels.revisions.current}</Badge>}
        </span>
      ),
    },
    {
      id: "created",
      header: labels.revisions.columns.created,
      cell: (revision) => revision.createdAt.toISOString().slice(0, 16).replace("T", " "),
    },
    { id: "priority", header: labels.revisions.columns.priority, cell: (revision) => revision.priority, className: "text-right" },
    { id: "valid", header: labels.revisions.columns.valid, cell: (revision) => validityText(revision, t.noEnd) },
  ];

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <Link href={`/admin/${tenant.code}/boms`} className="text-sm underline underline-offset-4">
        {labels.allBoms}
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{messages.boms.detailHeading(bom.id, output.description)}</h1>
        {editable && (
          <BomControls
            bom={bom}
            output={output}
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            choices={componentChoices(materials, units, bom.components.map(({ material }) => material))}
          />
        )}
      </div>
      <Card>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            {details.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <section aria-labelledby="recipe-heading" className="flex flex-col gap-4">
        <h2 id="recipe-heading" className="text-lg font-semibold">
          {recipeHeading}
        </h2>
        {historic && (
          <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50">
            {fill(labels.revisions.history, { number: String(historic.number), count: String(bom.revision), current: String(bom.revision) })}{" "}
            <Link href={path} className="font-medium underline underline-offset-4">
              {labels.revisions.showCurrent}
            </Link>
          </p>
        )}
        <p className="text-sm text-muted-foreground">{fill(labels.recipe.intro, { baseUnit: output.baseUnit, output: output.description })}</p>
        <RecipeTable tenant={tenant.code} lines={shown.components} materials={byId} labels={labels} label={recipeHeading} />
      </section>
      <section aria-labelledby="revisions-heading" className="flex flex-col gap-4">
        <h2 id="revisions-heading" className="text-lg font-semibold">
          {labels.revisions.heading}
        </h2>
        <p className="text-sm text-muted-foreground">{labels.revisions.intro}</p>
        <DataTable
          label={labels.revisions.heading}
          columns={revisionColumns}
          rows={bom.revisions}
          rowKey={(revision) => String(revision.number)}
          empty=""
        />
      </section>
    </div>
  );
}
