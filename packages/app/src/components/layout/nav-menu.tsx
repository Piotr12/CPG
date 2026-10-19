"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, MenuIcon, UserRoundIcon, XIcon } from "lucide-react";
import { Button } from "@cpg/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@cpg/ui/components/popover";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@cpg/ui/components/sheet";
import { cn } from "@cpg/ui/lib/utils";
import { isCurrentPath } from "./nav-items";

export interface NavLink {
  id: string;
  href: string;
  label: string;
}

interface NavMenuProps {
  items: NavLink[];
  /** The signed-in account's name and controls; null for a visitor. */
  account: { name: string; panel: ReactNode } | null;
  /** The popover and the sheet render outside the bar, so they carry the language themselves. */
  locale: string;
  labels: { menu: string; close: string; account: string };
}

/**
 * The menu every page shares. From `md` the entries are inline and the account controls open from a
 * popover; below that one Menu button opens a sheet holding both. The entry for the open screen is
 * marked `aria-current="page"`.
 */
export function NavMenu({ items, account, locale, labels }: NavMenuProps) {
  const pathname = usePathname();
  const current = (href: string) => isCurrentPath(href, pathname);

  return (
    <div className="flex flex-1 items-center gap-4">
      <nav aria-label={labels.menu} className="hidden md:block">
        <ul className="flex items-center gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                aria-current={current(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground",
                  "aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:underline-offset-[6px]",
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {account && (
        <Popover>
          <PopoverTrigger asChild>
            {/* The name stays in the accessible name, so what a reader sees is what is announced (WCAG 2.5.3). */}
            <Button
              variant="outline"
              size="sm"
              aria-label={`${labels.account}: ${account.name}`}
              className="ml-auto hidden max-w-40 md:inline-flex"
            >
              <UserRoundIcon aria-hidden />
              <span className="truncate">{account.name}</span>
              <ChevronDownIcon aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" lang={locale} aria-label={labels.account} className="w-auto max-w-[calc(100vw-2rem)] p-4">
            {account.panel}
          </PopoverContent>
        </Popover>
      )}

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto md:hidden">
            <MenuIcon aria-hidden />
            {labels.menu}
          </Button>
        </SheetTrigger>
        <SheetContent lang={locale} showCloseButton={false} aria-describedby={undefined} className="gap-0 overflow-y-auto">
          <SheetHeader className="flex-row items-center justify-between">
            <SheetTitle>{labels.menu}</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon-sm">
                <XIcon aria-hidden />
                <span className="sr-only">{labels.close}</span>
              </Button>
            </SheetClose>
          </SheetHeader>
          <nav aria-label={labels.menu} className="px-4">
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.id}>
                  {/* Closing on every link, the current page's too, so following one never leaves the sheet open. */}
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      aria-current={current(item.href) ? "page" : undefined}
                      className="flex min-h-11 items-center rounded-md px-3 text-base hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-semibold"
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                </li>
              ))}
            </ul>
          </nav>
          {account && <div className="mx-4 mt-2 border-t py-4">{account.panel}</div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
