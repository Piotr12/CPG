import Link from "next/link";
import { Button } from "@cpg/ui/components/button";

/** The admin's way from a master-data list to the Import screen (mockup 01's "Import from spreadsheet"). */
export function ImportLink({ tenant, label }: { tenant: string; label: string }) {
  return (
    <Button asChild variant="outline" className="shrink-0">
      <Link href={`/admin/${tenant}/import`}>{label}</Link>
    </Button>
  );
}
