import type { ForecastView, Locale, MaterialSummary, NamedRecordView } from "@cpg/core";
import type { Messages } from "../../i18n/messages/en";
import { locationOptions, materialOptions, withReferences } from "../master-data/references";
import { AddForecastDialog } from "./add-forecast-dialog";
import { ForecastsFilter } from "./forecasts-filter";
import { ForecastsTable } from "./forecasts-table";
import { forecastsLabels } from "./labels";

interface ForecastsScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  /** The forecasts to list, already narrowed by `filter`. */
  forecasts: ForecastView[];
  /** The tenant's full lists, for the rows' details and the filter's and the add form's choices. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  /** The material and location the list is narrowed to, if any. */
  filter: { material?: string; location?: string };
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Add and the row menus (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
}

/** The body of the forecasts page (E08-S03): heading, intro, the filter, the admin's Add forecast, and the list. */
export function ForecastsScreen({ tenant, forecasts, materials, locations, filter, locale, messages, admin }: ForecastsScreenProps) {
  const labels = forecastsLabels(messages);
  const editable = admin && !tenant.readOnly;
  const rows = withReferences(forecasts, materials, locations);

  return (
    <div lang={locale} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.forecasts.heading(tenant.name)}</h1>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{labels.intro}</p>
        {editable && (
          <AddForecastDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialOptions(materials)}
            locations={locationOptions(locations)}
          />
        )}
      </div>
      <ForecastsFilter
        action={`/admin/${tenant.code}/forecasts`}
        labels={labels}
        materials={materials.map(({ id, description }) => ({ value: id, label: `${id} — ${description}` }))}
        locations={locations.map(({ id, name }) => ({ value: id, label: `${id} — ${name}` }))}
        selected={filter}
      />
      <ForecastsTable
        tenant={tenant}
        rows={rows}
        labels={labels}
        editable={editable}
        filtered={filter.material !== undefined || filter.location !== undefined}
      />
    </div>
  );
}
