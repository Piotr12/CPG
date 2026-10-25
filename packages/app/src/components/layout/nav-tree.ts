/*
 * The sidebar's shape, dependency-free on purpose: the client sidebar and the section trail import it,
 * and `nav-items.ts` (which filters it by role and adds labels on the server) pulls in `@cpg/core`.
 */
import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { isCurrentPath, type NavMatch } from "./current-path";

/** Every entry and group the sidebar can show. A new screen adds its id here and one line below. */
export type NavId =
  | "stock"
  | "stockImport"
  | "stockReport"
  | "varianceReport"
  | "overview"
  | "transactions"
  | "productionOrders"
  | "customerOrders"
  | "masterData"
  | "materials"
  | "locations"
  | "customers"
  | "suppliers"
  | "planningParameters"
  | "safetyStock"
  | "boms"
  | "statisticalUnits"
  | "purchaseRequisitions"
  | "purchaseOrders"
  | "transfers"
  | "sales"
  | "forecasts"
  | "demandReview"
  | "import"
  | "tenantAudit"
  | "administration"
  | "users"
  | "tenantsPage"
  | "globalAudit"
  | "help";

/**
 * A screen. Tenant entries name a `section` under `/admin/{tenant}` ("" is the tenant's Overview),
 * because only the client knows which tenant the tree targets; shared entries name their `href`.
 */
export type NavLeaf = { id: NavId; match: NavMatch; adminOnly?: boolean } & ({ section: string } | { href: string });

/** A collapsible group of screens. */
export interface NavGroup {
  id: NavId;
  adminOnly?: boolean;
  children: NavLeaf[];
}

export type NavNode = NavLeaf | NavGroup;

/** The tenant zone: what the switch's tenant holds, Transactions above Stock and Reports (design system D6). Each story adds its own line. */
export const TENANT_TREE: NavNode[] = [
  { id: "overview", section: "", match: "exact" },
  {
    id: "masterData",
    children: [
      { id: "materials", section: "materials", match: "prefix" },
      { id: "locations", section: "locations", match: "prefix" },
      { id: "customers", section: "customers", match: "prefix" },
      { id: "suppliers", section: "suppliers", match: "prefix" },
      { id: "planningParameters", section: "planning-parameters", match: "prefix" },
      { id: "safetyStock", section: "safety-stock", match: "prefix" },
      { id: "boms", section: "boms", match: "prefix" },
      { id: "statisticalUnits", section: "statistical-units", match: "prefix" },
      { id: "import", section: "import", match: "prefix", adminOnly: true },
    ],
  },
  {
    id: "sales",
    children: [
      { id: "forecasts", section: "forecasts", match: "prefix" },
      { id: "demandReview", section: "reports/demand-review", match: "prefix" },
    ],
  },
  {
    id: "transactions",
    children: [
      { id: "productionOrders", section: "production-orders", match: "prefix" },
      { id: "customerOrders", section: "customer-orders", match: "prefix" },
      { id: "purchaseRequisitions", section: "purchase-requisitions", match: "prefix" },
      { id: "purchaseOrders", section: "purchase-orders", match: "prefix" },
      { id: "transfers", section: "transfers", match: "prefix" },
    ],
  },
  { id: "stock", section: "stock", match: "prefix" },
  { id: "stockImport", section: "stock-import", match: "prefix" },
  { id: "stockReport", section: "reports/stock", match: "prefix" },
  { id: "varianceReport", section: "reports/variance", match: "prefix" },
  { id: "tenantAudit", section: "audit", match: "prefix" },
];

/** The shared zone: screens that belong to no tenant. `/admin` is exact, or it would match every page. */
export const SHARED_TREE: NavNode[] = [
  {
    id: "administration",
    adminOnly: true,
    children: [
      { id: "users", href: "/admin/users", match: "prefix" },
      { id: "tenantsPage", href: "/admin", match: "exact" },
    ],
  },
  { id: "globalAudit", href: "/admin/audit", match: "prefix" },
  { id: "help", href: "/help", match: "prefix" },
];

/** Where an account manages its own API tokens: reached from the account card, not the tree. */
export const TOKENS_PATH = "/admin/tokens";

/** An entry with its label in the reader's language, as `navModel` hands it to the client. */
export type NavEntry = NavLeaf & { label: string };

/** A group with its label, holding only the entries this account may see. */
export interface NavSection extends Omit<NavGroup, "children"> {
  label: string;
  children: NavEntry[];
}

export type NavItem = NavEntry | NavSection;

/** What one account's sidebar shows: the tenant zone and the shared zone, filtered and labelled. */
export interface NavModel {
  tenant: NavItem[];
  shared: NavItem[];
}

export function isGroup<G extends { children: unknown[] }, L extends object>(node: G | L): node is G {
  return "children" in node;
}

/** Where an entry leads, for the tenant the tree currently targets. */
export function leafHref(leaf: NavLeaf, tenant: TenantCode): string {
  if ("href" in leaf) return leaf.href;
  return leaf.section ? `/admin/${tenant}/${leaf.section}` : `/admin/${tenant}`;
}

/** Whether `pathname` is this entry's screen, for the tenant the tree targets. */
export const isCurrentLeaf = (leaf: NavLeaf, tenant: TenantCode, pathname: string) =>
  isCurrentPath(leafHref(leaf, tenant), pathname, leaf.match);

/** One step of the section trail: a group (plain words), an entry (a link while a record is open under it), or the record. */
export interface TrailStep {
  label: string;
  /** Where the step leads; only an entry whose page isn't the open one has it. */
  href?: string;
  /** The open record's ID, the last step on a detail page. */
  record?: boolean;
}

/** The entry's step, then the open record's ID when the page sits under the entry rather than on it. */
function entrySteps(entry: NavEntry, tenant: TenantCode, pathname: string): TrailStep[] {
  const href = leafHref(entry, tenant);
  if (pathname === href) return [{ label: entry.label }];
  const [record] = pathname.slice(href.length + 1).split("/");
  return [{ label: entry.label, href }, { label: record, record: true }];
}

/**
 * The open page's place in the sidebar: its group's label (if any), its entry's, and on a detail page
 * the record (`Transactions › Production orders › 00000060`, the list a link). Empty when the
 * sidebar doesn't hold it (`/admin/tokens`, or Tenants for a normal user).
 */
export function trailOf(model: NavModel, tenant: TenantCode, pathname: string): TrailStep[] {
  for (const node of [...model.tenant, ...model.shared]) {
    if (isGroup(node)) {
      const entry = node.children.find((child) => isCurrentLeaf(child, tenant, pathname));
      if (entry) return [{ label: node.label }, ...entrySteps(entry, tenant, pathname)];
    } else if (isCurrentLeaf(node, tenant, pathname)) {
      return entrySteps(node, tenant, pathname);
    }
  }
  return [];
}
