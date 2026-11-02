import { ChevronDown } from "lucide-react";
import type { Locale, MaterialSummary, MrpBomRejectionView } from "@cpg/core";
import { Button } from "@cpg/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cpg/ui/components/collapsible";
import { plural } from "@cpg/ui/lib/plural";
import type { Messages } from "../../i18n/messages/en";
import { fill, localeQuantity } from "../forms/form-labels";

type RejectionLabels = Messages["mrp"]["explanations"]["rejections"];

/** The tenant's materials by ID: a component's description and base unit (spec Q7). */
export type MaterialsByCode = ReadonlyMap<string, Pick<MaterialSummary, "description" | "baseUnit">>;

export function materialsByCode(materials: readonly MaterialSummary[]): MaterialsByCode {
  return new Map(materials.map((material) => [material.id, material]));
}

interface MrpBomRejectionsProps {
  rejections: readonly MrpBomRejectionView[];
  materials: MaterialsByCode;
  locale: Locale;
  labels: RejectionLabels;
}

/**
 * Every BOM MRP passed over, in the order it tested them (E18-S03, UX-020, PRD §04 "BOM choice and
 * explanation"): a shortage lists each short component with what it needs, what is dependable and what is
 * short, in that component's base unit; an inactive component is named. Masters are never deleted, so a
 * component always resolves; one that didn't would show its code without a unit.
 */
export function MrpBomRejections({ rejections, materials, locale, labels: t }: MrpBomRejectionsProps) {
  const name = (code: string) => {
    const material = materials.get(code);
    return material ? `${code} ${material.description}` : code;
  };
  const amount = (quantity: string, code: string) => {
    const unit = materials.get(code)?.baseUnit;
    return unit ? `${localeQuantity(quantity, locale)} ${unit}` : localeQuantity(quantity, locale);
  };
  return (
    <ul aria-label={t.label} className="flex flex-col gap-1 text-sm whitespace-normal" data-mrp-rejections>
      {rejections.map((rejection) => {
        const bom = fill(t.bom, { bom: rejection.bom, revision: String(rejection.revision) });
        const key = `${rejection.bom}/${rejection.revision}`;
        if (rejection.reason === "inactive-component") {
          return <li key={key} data-mrp-rejection={rejection.reason}>{fill(t.inactive, { bom, materials: rejection.materials.map(name).join(", ") })}</li>;
        }
        return (
          <li key={key} data-mrp-rejection={rejection.reason}>
            {fill(t.shortage, { bom })}
            <ul className="mt-0.5 flex flex-col gap-0.5 pl-4 text-muted-foreground">
              {rejection.shortages.map(({ material, required, available, shortage }) => (
                <li key={material} data-mrp-shortage>
                  {fill(t.line, { material: name(material), required: amount(required, material), available: amount(available, material), shortage: amount(shortage, material) })}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

/** "Why this BOM": the rejected BOMs behind a disclosure, closed by default; nothing when MRP passed over none. */
export function WhyBom(props: MrpBomRejectionsProps) {
  const { rejections, locale, labels: t } = props;
  if (rejections.length === 0) return null;
  return (
    <Collapsible className="group/why mt-1" data-mrp-why-bom>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="link" size="xs" className="h-auto px-0 font-medium">
          {plural(locale, rejections.length, t.why)}
          <ChevronDown aria-hidden className="transition-transform group-data-[state=open]/why:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <MrpBomRejections {...props} />
      </CollapsibleContent>
    </Collapsible>
  );
}
