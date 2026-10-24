import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Callout } from "@cpg/ui/backend/feedback/callout";
import { SidebarProvider } from "@cpg/ui/components/sidebar";
import { TooltipProvider } from "@cpg/ui/components/tooltip";
import { AppSidebar, SidebarSkeleton } from "../components/layout/app-sidebar";
import { AppFooter } from "../components/layout/app-footer";
import { en } from "../i18n/messages/en";
import { pl } from "../i18n/messages/pl";
import { THEME_SCRIPT } from "../preferences/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Caveman Planning Good",
  description: "A small MRP II planning tool: it turns what customers want into plans for what to buy and what to make.",
};

/**
 * The shell stays static: the theme is painted by the head script from the `cpg_theme` cookie, and the
 * account-specific parts live in the `<Suspense>` slot. `suppressHydrationWarning` covers the `dark`
 * class and `lang` that the script and `DocumentPreferences` set on <html> outside React.
 *
 * The sidebar's provider and the content column are static too; only the sidebar's contents stream.
 * Below `md` the page is a column (the top bar above the content), from `md` a row (the sidebar beside
 * it), and a column again when the visitor bar stands in for the sidebar. The column is a plain `div`
 * rather than shadcn's `SidebarInset`, which renders a `<main>`: pages render their own.
 *
 * Every page needs JavaScript (decision D5). Without it the `<noscript>` notice says so above the page,
 * in both languages, since the static shell knows no reader.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full font-sans">
        <noscript>
          <div className="px-4 pt-4 md:px-6">
            <Callout tone="warning">
              <p lang="en">{en.noscript}</p>
              <p lang="pl">{pl.noscript}</p>
            </Callout>
          </div>
        </noscript>
        <TooltipProvider>
          <SidebarProvider className="flex-col md:flex-row md:has-[[data-visitor-bar]]:flex-col">
            <Suspense fallback={<SidebarSkeleton />}>
              <AppSidebar />
            </Suspense>
            <div data-content-column className="flex min-w-0 flex-1 flex-col">
              {children}
              <AppFooter />
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
