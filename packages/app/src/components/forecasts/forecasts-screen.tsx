import type { ForecastView, Locale, MaterialSummary, NamedRecordView } from "@cpg/core";
import type { ForecastSort } from "@cpg/core/validators/forecasts/forecast-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { PageLinks } from "../layout/page-links";
import type { ListLinks, ListSearchState } from "../lists/list-params";
import { ListSearchBar } from "../lists/list-search-bar";
import { locationOptions, withReferences } from "../master-data/references";
import { materialOptions } from "../materials/material-picker";
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
  /** The list's search and sort (#217), their links, and how many forecasts the filter and search match. */
  list: { search: ListSearchState; sort: { sort: ForecastSort; dir: SortDirection }; links: ListLinks; count: number };
  /** The page shown, 1-based, and how many there are. */
  page: number;
  pages: number;
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Add and the row menus (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
}

/**
 * The body of the forecasts page (E08-S03): heading, intro, the search box (#217), the filter, the
 * admin's Add forecast, and a page of the list. The search keeps the filter and the filter keeps the
 * search, each as hidden fields, so neither form undoes the other.
 */
export function ForecastsScreen({ tenant, forecasts, materials, locations, filter, list, page, pages, locale, messages, admin }: ForecastsScreenProps) {
  const labels = forecastsLabels(messages);
  const editable = admin && !tenant.readOnly;
  const rows = withReferences(forecasts, materials, locations);
  const { search, sort, links, count } = list;

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.forecasts.heading(tenant.name)}
        description={labels.intro}
        actions={editable && (
          <AddForecastDialog
            context={{ tenant: tenant.code, generation: tenant.generation }}
            labels={labels}
            materials={materialOptions(materials.filter(({ active }) => active))}
            locations={locationOptions(locations)}
            locale={locale}
          />
        )}
      />
      <ListSearchBar links={links} search={search} labels={labels.search} lists={messages.lists} locale={locale} count={count} />
      <div className="flex flex-col gap-8">
      <ForecastsFilter
        action={`/admin/${tenant.code}/forecasts`}
        labels={labels}
        materials={materials.map(({ id, description }) => ({ value: id, label: `${id} — ${description}` }))}
        locations={locations.map(({ id, name }) => ({ value: id, label: `${id} — ${name}` }))}
        selected={filter}
        keep={{ q: search.q || undefined, sort: links.keep.sort, dir: links.keep.dir }}
      />
      <ForecastsTable
        tenant={tenant}
        rows={rows}
        labels={labels}
        editable={editable}
        filtered={filter.material !== undefined || filter.location !== undefined}
        search={search.q}
        sort={sort}
        links={links}
        lists={messages.lists}
        pagination={<PageLinks page={page} pages={pages} labels={labels} href={links.pageHref} />}
      />
      </div>
    </div>
  );
}
