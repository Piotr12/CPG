import type { BomView, Locale, MaterialSummary } from "@cpg/core";
import { bomSortSchema, type BomSort } from "@cpg/core/validators/boms/bom-list.schema";
import type { SortDirection } from "@cpg/core/validators/lists/list-query.schema";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { ImportLink } from "../imports/import-link";
import { listLinks, type ListSearchState } from "../lists/list-params";
import { ListSearchBar } from "../lists/list-search-bar";
import { BomsTable } from "./boms-table";
import { componentChoices, outputChoices } from "./choices";
import { CreateBomDialog } from "./create-bom-dialog";
import { bomsLabels, materialsById } from "./labels";

interface BomsScreenProps {
  tenant: { code: string; name: string; generation: number; readOnly: boolean };
  boms: BomView[];
  /** The tenant's materials, for the rows' details and the form's choices, and each one's units. */
  materials: MaterialSummary[];
  units: Record<string, string[]>;
  locale: Locale;
  messages: Messages;
  /** Only the admin gets Create BOM (TEN-004), and only while the tenant isn't read-only (R05). */
  admin: boolean;
  /** The search and sort the page read from its address, and listed `boms` with (#217). */
  search: ListSearchState;
  sort: { sort: BomSort; dir: SortDirection };
}

/**
 * The body of the BOMs page (E04-S01): heading, intro, the admin's Create BOM, the search box and the
 * sortable list (#217).
 */
export function BomsScreen({ tenant, boms, materials, units, locale, messages, admin, search, sort }: BomsScreenProps) {
  const labels = bomsLabels(messages);
  const editable = admin && !tenant.readOnly;
  const links = listLinks({ path: `/admin/${tenant.code}/boms`, search: search.q, sort, defaults: bomSortSchema.parse({}) });

  return (
    <div lang={locale}>
      <PageHeader
        title={messages.boms.heading(tenant.name)}
        description={labels.intro}
        actions={
          editable && (
            <>
              <ImportLink tenant={tenant.code} label={messages.imports.link} />
              <CreateBomDialog
                context={{ tenant: tenant.code, generation: tenant.generation }}
                labels={labels}
                outputs={outputChoices(materials)}
                choices={componentChoices(materials, units)}
                locale={locale}
              />
            </>
          )
        }
      />
      <ListSearchBar links={links} search={search} labels={labels.search} lists={messages.lists} locale={locale} count={boms.length} />
      <div className="flex flex-col gap-8">
        <BomsTable
          tenant={tenant}
          boms={boms}
          materials={materialsById(materials)}
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
