import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TENANT_CODES, TENANT_NAMES, tenantCodeSchema, type TenantCode } from "@cpg/core";
import { TenantStrip } from "../../../components/tenants/tenant-strip";

/** Both tenants are known at build time, so their strips are part of the static shell. */
export function generateStaticParams() {
  return TENANT_CODES.map((tenant) => ({ tenant }));
}

/** The tenant segment, or a 404 for anything but `test` and `prod` (`TEST` included). */
async function tenantFrom(params: Promise<{ tenant: string }>): Promise<TenantCode> {
  const parsed = tenantCodeSchema.safeParse((await params).tenant);
  if (!parsed.success) notFound();
  return parsed.data;
}

/** Every tenant page's title starts with its tenant, so tabs and history show the scope too. */
export async function generateMetadata({ params }: LayoutProps<"/admin/[tenant]">): Promise<Metadata> {
  const name = TENANT_NAMES[await tenantFrom(params)];
  return { title: { template: `${name} · %s`, default: `${name} · Admin · Caveman Planning Good` } };
}

/** Pages that read and write one tenant's data: they show its strip (TEN-011) and switcher. */
export default async function TenantLayout({ children, params }: LayoutProps<"/admin/[tenant]">) {
  return (
    <>
      <TenantStrip scope={await tenantFrom(params)} />
      {children}
    </>
  );
}
