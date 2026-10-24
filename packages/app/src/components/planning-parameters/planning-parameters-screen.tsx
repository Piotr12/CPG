import type { Locale, MaterialSummary, NamedRecordView, PlanningParameterView } from "@cpg/core";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { planningParameterSortSchema, type PlanningParameterSort } from "@cpg/core/validators/planning-parameters/planning-parameter-list.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { listLinks, type ListSearchState } from "../lists/list-params";
import { ListSearchBar } from "../lists/list-search-bar";
import { AddPlanningParametersDialog } from "./add-planning-parameters-dialog";
import { planningParametersLabels } from "./labels";
import { PlanningParametersTable } from "./planning-parameters-table";
import { activeMaterialOptions } from "../materials/material-picker";
import { locationOptions, withReferences } from "../master-data/references";

interface PlanningParametersScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  sets: PlanningParameterView[];
  /** The tenant's full lists, for the rows' details and the add form's choices. */
  materials: MaterialSummary[];
  locations: NamedRecordView[];
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Add and the row menus (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
  /** The search and sort the page read from its address, and listed `sets` with (#217). */
  search: ListSearchState;
  sort: { sort: PlanningParameterSort; dir: SortDirection };
}

/**
 * The body of the planning parameters page (E03-S03): heading, intro, the admin's Add, the search box
 * and the sortable list (#217).
 */
export function PlanningParametersScreen({ tenant, sets, materials, locations, locale, messages, admin, search, sort }: PlanningParametersScreenProps) {
  const labels = planningParametersLabels(messages);
  const editable = admin && !tenant.readOnly;
  const links = listLinks({
    path: `/admin/${tenant.code}/planning-parameters`,
    search: search.q,
    sort,
    defaults: planningParameterSortSchema.parse({}),
  });

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.planningParameters.heading(tenant.name)}
        description={labels.intro}
        actions={
          editable && (
            <AddPlanningParametersDialog
              context={{ tenant: tenant.code, generation: tenant.generation }}
              labels={labels}
              materials={activeMaterialOptions(materials)}
              locations={locationOptions(locations)}
              locale={locale}
            />
          )
        }
      />
      <ListSearchBar links={links} search={search} labels={labels.search} lists={messages.lists} locale={locale} count={sets.length} />
      <div className="flex flex-col gap-8">
        <PlanningParametersTable
          tenant={tenant}
          rows={withReferences(sets, materials, locations)}
          labels={labels}
          editable={editable}
          search={search.q}
          sort={sort}
          links={links}
          lists={messages.lists}
        />
      </div>
    </div>
  );
}
