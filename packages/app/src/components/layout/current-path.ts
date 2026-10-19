/* Dependency-free on purpose: the client menu imports it, and `nav-items.ts` pulls in `@cpg/core`. */

/**
 * Whether `pathname` is inside the entry's screen: the screen itself or a page under it, so
 * `/admin/test/audit` belongs to Test. `/admin` only matches itself, or it would match every entry.
 */
export function isCurrentPath(href: string, pathname: string): boolean {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}
