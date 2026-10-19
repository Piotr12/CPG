import { TenantStrip } from "../../../components/tenants/tenant-strip";

/** Admin pages that belong to no tenant: they show the Global strip (TEN-011). */
export default function GlobalAdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <TenantStrip scope="global" />
      {children}
    </>
  );
}
