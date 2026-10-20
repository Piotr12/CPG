import Link from "next/link";
import { Button } from "@cpg/ui/components/button";

/**
 * The way from a list to its import screen (mockup 01's "Import from spreadsheet"): the admin's from
 * a master-data list to Import, or anyone's from Stock to Stock import (`section`).
 */
export function ImportLink({ tenant, label, section = "import" }: { tenant: string; label: string; section?: "import" | "stock-import" }) {
  return (
    <Button asChild variant="outline" className="shrink-0">
      <Link href={`/admin/${tenant}/${section}`}>{label}</Link>
    </Button>
  );
}
