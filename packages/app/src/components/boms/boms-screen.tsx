import type { BomView, Locale, MaterialSummary } from "@cpg/core";
import { PageHeader } from "@cpg/ui/backend/page-header";
import type { Messages } from "../../i18n/messages/en";
import { ImportLink } from "../imports/import-link";
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
}

/** The body of the BOMs page (E04-S01): heading, intro, the admin's Create BOM, and the list. */
export function BomsScreen({ tenant, boms, materials, units, locale, messages, admin }: BomsScreenProps) {
  const labels = bomsLabels(messages);
  const editable = admin && !tenant.readOnly;

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
              />
            </>
          )
        }
      />
      <div className="flex flex-col gap-8">
        <BomsTable tenant={tenant} boms={boms} materials={materialsById(materials)} labels={labels} editable={editable} />
      </div>
    </div>
  );
}
