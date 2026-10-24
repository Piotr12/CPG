"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@cpg/core";
import { cn } from "@cpg/ui/lib/utils";
import { isCurrentPath } from "./current-path";
import { MammothMark } from "./mammoth-mark";

/**
 * What a visitor sees instead of the sidebar (Q6): the brand, Help and Sign in in one slim bar. The
 * root layout lays the page out as a column when this bar is present (`data-visitor-bar`).
 */
export function VisitorBar({ locale, labels }: { locale: Locale; labels: { menu: string; help: string; signIn: string } }) {
  const pathname = usePathname();
  const links = [
    { href: "/help", label: labels.help },
    { href: "/login", label: labels.signIn },
  ];

  return (
    <header lang={locale} data-visitor-bar className="flex h-12 shrink-0 items-center gap-4 border-b px-4 text-sm md:px-6">
      <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap">
        <MammothMark size={20} />
        CPG
      </Link>
      <nav aria-label={labels.menu} className="ml-auto">
        <ul className="flex items-center gap-1">
          {links.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isCurrentPath(href, pathname, "prefix") ? "page" : undefined}
                className={cn(
                  "rounded-md px-2 py-2 whitespace-nowrap text-muted-foreground hover:text-foreground",
                  "aria-[current=page]:text-foreground aria-[current=page]:underline aria-[current=page]:underline-offset-4",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
