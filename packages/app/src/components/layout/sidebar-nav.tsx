"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BlocksIcon,
  Building2Icon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  CircleHelpIcon,
  DatabaseIcon,
  FileSpreadsheetIcon,
  GlobeIcon,
  HistoryIcon,
  HouseIcon,
  LifeBuoyIcon,
  LockIcon,
  MapPinIcon,
  MenuIcon,
  PackageIcon,
  ShieldIcon,
  ShoppingCartIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
  TruckIcon,
  UsersIcon,
  UserRoundIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { Locale } from "@cpg/core";
import type { TenantCode } from "@cpg/core/validators/tenants/tenant-code.schema";
import { Button } from "@cpg/ui/components/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cpg/ui/components/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@cpg/ui/components/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@cpg/ui/components/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@cpg/ui/components/sidebar";
import { TenantSwitch } from "../tenants/tenant-switch";
import { isCurrentPath, tenantFromPath } from "./current-path";
import { isCurrentLeaf, isGroup, leafHref, TOKENS_PATH, type NavEntry, type NavId, type NavModel, type NavSection } from "./nav-tree";

/** On a fresh load of a page outside any tenant, the menu targets Test: the safe default (Q7). */
const DEFAULT_TENANT: TenantCode = "test";

const ICONS: Record<NavId, LucideIcon> = {
  stock: PackageIcon,
  overview: HouseIcon,
  transactions: TruckIcon,
  customerOrders: FileSpreadsheetIcon,
  masterData: DatabaseIcon,
  materials: PackageIcon,
  locations: MapPinIcon,
  customers: UsersIcon,
  suppliers: TruckIcon,
  planningParameters: SlidersHorizontalIcon,
  safetyStock: LifeBuoyIcon,
  boms: BlocksIcon,
  sales: ShoppingCartIcon,
  forecasts: TrendingUpIcon,
  import: FileSpreadsheetIcon,
  tenantAudit: HistoryIcon,
  administration: ShieldIcon,
  users: UserRoundIcon,
  tenantsPage: Building2Icon,
  globalAudit: GlobeIcon,
  help: CircleHelpIcon,
};

/** Every string the sidebar shows, resolved on the server in the reader's language. */
export interface SidebarLabels {
  menu: string;
  close: string;
  account: string;
  collapse: string;
  expand: string;
  sidebar: string;
  sidebarDescription: string;
  shared: string;
  sharedNote: string;
  tenantNames: Record<TenantCode, string>;
  tenantSwitch: Record<TenantCode, string>;
  menuShows: Record<TenantCode, string>;
  captions: Record<TenantCode, string>;
  readOnly: string;
  readOnlyCaption: string;
}

interface SidebarNavProps {
  model: NavModel;
  labels: SidebarLabels;
  /** Which tenants are read-only now (R05), read once per render on the server. */
  readOnly: Record<TenantCode, boolean>;
  /** The account card: name, role in words, and the popover's controls. */
  account: { name: string; role: string; panel: ReactNode };
  /** Popovers and the drawer render outside the sidebar, so they carry the language themselves. */
  locale: Locale;
}

/** Where the tree points and how it is shown, shared by every entry. */
interface TreeContext {
  tenant: TenantCode;
  pathname: string;
  isRail: boolean;
  locale: Locale;
  onNavigate: () => void;
}

/**
 * The sidebar every signed-in page shares (spec 2026-10-19--2048UTC-sidebar-navigation): the TEST |
 * PROD switch, the tenant's screens, the shared screens and the account card. Desktop: expanded or an
 * icon rail; below 768 px a drawer behind a slim top bar. The server decides what the account may
 * see (`navModel`); this decides where things go, which tenant the tree targets and which entry is
 * current. It lives in the root layout, so it keeps its state across navigations: the remembered
 * tenant survives, and the drawer and the account popover close whenever the path changes.
 */
export function SidebarNav({ model, labels, readOnly, account, locale }: SidebarNavProps) {
  const pathname = usePathname();
  const pageTenant = tenantFromPath(pathname);
  const [remembered, setRemembered] = useState(pageTenant ?? DEFAULT_TENANT);
  const [accountOpen, setAccountOpen] = useState(false);
  const [shownOn, setShownOn] = useState(pathname);
  // Adjusting state while rendering, as React's docs recommend over an effect.
  if (shownOn !== pathname) {
    setShownOn(pathname);
    setAccountOpen(false);
  }
  if (pageTenant && pageTenant !== remembered) setRemembered(pageTenant);
  const tenant = pageTenant ?? remembered;

  const { isMobile, state, openMobile, setOpenMobile, toggleSidebar } = useSidebar();
  // The drawer's state belongs to the provider, so it can't be adjusted while this renders.
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile]);
  // Menu isn't the sheet's own Radix trigger, so the sheet can't give focus back to it on close.
  const menuButton = useRef<HTMLButtonElement>(null);
  const wasDrawerOpen = useRef(false);
  useEffect(() => {
    if (wasDrawerOpen.current && !openMobile) menuButton.current!.focus();
    wasDrawerOpen.current = openMobile;
  }, [openMobile]);
  const closeDrawer = () => setOpenMobile(false);
  const isRail = state === "collapsed" && !isMobile;
  const tree: TreeContext = { tenant, pathname, isRail, locale, onNavigate: closeDrawer };
  const caption = !pageTenant ? (
    labels.sharedNote
  ) : readOnly[tenant] ? (
    <>
      <LockIcon aria-hidden className="mr-1 inline size-3 align-[-2px]" />
      {labels.readOnlyCaption}
    </>
  ) : (
    labels.captions[tenant]
  );
  const brandHref = leafHref({ id: "overview", section: "", match: "exact" }, tenant);

  const tenantSwitch = (compact: boolean) => (
    <TenantSwitch
      tenant={tenant}
      pathname={pathname}
      isTenantPage={pageTenant !== null}
      label={(pageTenant ? labels.tenantSwitch : labels.menuShows)[tenant]}
      names={labels.tenantNames}
      readOnly={readOnly}
      readOnlyLabel={labels.readOnly}
      onChoose={setRemembered}
      compact={compact}
      onNavigate={closeDrawer}
    />
  );

  return (
    <>
      {/* `data-signed-in-as` is in the DOM at every width (the bar is only hidden from md): tests read who is signed in from it. */}
      <header lang={locale} data-mobile-bar data-signed-in-as={account.name} className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b bg-background px-3 md:hidden">
        <Button ref={menuButton} variant="outline" size="sm" onClick={toggleSidebar} data-action="open-menu">
          <MenuIcon aria-hidden />
          {labels.menu}
        </Button>
        <Link href={brandHref} className="font-semibold whitespace-nowrap">
          <span aria-hidden>🦣</span> CPG
        </Link>
        <div className="ml-auto">{tenantSwitch(true)}</div>
      </header>

      <Sidebar collapsible="icon" sheetTitle={labels.sidebar} sheetDescription={labels.sidebarDescription}>
        <nav aria-label={labels.menu} lang={locale} className="flex min-h-0 flex-1 flex-col">
          <SidebarHeader className="gap-3 border-b">
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
              <Link href={brandHref} onClick={closeDrawer} className="flex items-center gap-2 px-1 font-semibold whitespace-nowrap">
                <span aria-hidden>🦣</span>
                <span className="group-data-[collapsible=icon]:sr-only">CPG</span>
              </Link>
              {isMobile ? (
                <Button variant="ghost" size="icon-sm" onClick={closeDrawer}>
                  <XIcon aria-hidden />
                  <span className="sr-only">{labels.close}</span>
                </Button>
              ) : (
                <SidebarTrigger label={state === "expanded" ? labels.collapse : labels.expand} data-action="toggle-sidebar" />
              )}
            </div>
            {tenantSwitch(false)}
            <p className="px-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {caption}
            </p>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>{model.tenant.map((node) => (isGroup(node) ? <TreeGroup key={node.id} group={node} {...tree} /> : <TreeLeaf key={node.id} entry={node} {...tree} />))}</SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t">
            <SidebarGroup className="p-0">
              {/* Hidden in the rail: its words would spill out of the 3 rem column, if invisibly. */}
              <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
                <GlobeIcon aria-hidden className="mr-2" />
                {labels.shared}
              </SidebarGroupLabel>
              <SidebarMenu>{model.shared.map((node) => (isGroup(node) ? <TreeGroup key={node.id} group={node} {...tree} /> : <TreeLeaf key={node.id} entry={node} {...tree} />))}</SidebarMenu>
            </SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                {/* Modal, so Tab stays inside until Escape or a click outside returns to the card. */}
                <Popover modal open={accountOpen} onOpenChange={setAccountOpen}>
                  <PopoverTrigger asChild>
                    {/* The name stays in the accessible name, so what a reader sees is what is announced (WCAG 2.5.3). */}
                    <SidebarMenuButton
                      size="lg"
                      isActive={isCurrentPath(TOKENS_PATH, pathname, "prefix")}
                      aria-label={`${labels.account}: ${account.name}`}
                      data-action="account-menu"
                    >
                      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary font-semibold text-sidebar-primary-foreground">
                        {account.name.charAt(0).toUpperCase()}
                      </span>
                      {/* In the rail the card shows only the avatar. */}
                      <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
                        <span title={account.name} className="truncate font-medium">
                          {account.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{account.role}</span>
                      </span>
                      <ChevronsUpDownIcon aria-hidden className="ml-auto group-data-[collapsible=icon]:hidden" />
                    </SidebarMenuButton>
                  </PopoverTrigger>
                  <PopoverContent
                    side={isRail ? "right" : "top"}
                    align="start"
                    lang={locale}
                    aria-label={labels.account}
                    className="w-auto max-w-[calc(100vw-2rem)] p-4"
                  >
                    {account.panel}
                  </PopoverContent>
                </Popover>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </nav>
      </Sidebar>
    </>
  );
}

/** A screen at the top of a zone: a link, with a tooltip in the rail. */
function TreeLeaf({ entry, tenant, pathname, onNavigate }: { entry: NavEntry } & TreeContext) {
  const Icon = ICONS[entry.id];
  const isCurrent = isCurrentLeaf(entry, tenant, pathname);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isCurrent} tooltip={entry.label}>
        <Link href={leafHref(entry, tenant)} aria-current={isCurrent ? "page" : undefined} onClick={onNavigate}>
          <Icon aria-hidden />
          <span>{entry.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * A group of screens. Expanded (and in the drawer) it is a collapsible list that starts open and stays
 * open while it holds the current page; in the rail its icon opens the entries as a fly-out.
 */
function TreeGroup({ group, tenant, pathname, isRail, locale, onNavigate }: { group: NavSection } & TreeContext) {
  const [isOpen, setOpen] = useState(true);
  const Icon = ICONS[group.id];
  const currentEntry = group.children.find((entry) => isCurrentLeaf(entry, tenant, pathname));
  // A group that holds the current page is open, and stays open after the page changes: folding it
  // then would be ignored now and only take effect on a later, unrelated navigation.
  if (currentEntry !== undefined && !isOpen) setOpen(true);

  if (isRail) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={currentEntry !== undefined} data-group={group.id}>
              <Icon aria-hidden />
              <span>{group.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" lang={locale}>
            <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
            {group.children.map((entry) => (
              <DropdownMenuItem key={entry.id} asChild>
                <Link href={leafHref(entry, tenant)} aria-current={entry === currentEntry ? "page" : undefined}>
                  {entry.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild open={isOpen} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton data-group={group.id}>
            <Icon aria-hidden />
            <span>{group.label}</span>
            <ChevronDownIcon aria-hidden className="ml-auto transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {group.children.map((entry) => (
              <SidebarMenuSubItem key={entry.id}>
                <SidebarMenuSubButton asChild isActive={entry === currentEntry}>
                  <Link href={leafHref(entry, tenant)} aria-current={entry === currentEntry ? "page" : undefined} onClick={onNavigate}>
                    <span>{entry.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
