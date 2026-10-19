import { TenantHeader } from "../../../components/tenants/tenant-header";

/** Admin pages that belong to no tenant: they show the Global header row (TEN-011). */
export default function GlobalAdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <TenantHeader scope="global" />
      {children}
    </>
  );
}
