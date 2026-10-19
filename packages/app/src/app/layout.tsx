import { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppBar, AppBarPlaceholder } from "../components/layout/app-bar";
import { AppFooter } from "../components/layout/app-footer";
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
  description: "MRP II. Because planning hard. Caveman try anyway.",
};

/**
 * The shell stays static: the theme is painted by the head script from the `cpg_theme` cookie, and the
 * account-specific parts live in the `<Suspense>` slot. `suppressHydrationWarning` covers the `dark`
 * class and `lang` that the script and `DocumentPreferences` set on <html> outside React.
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
      <body className="min-h-full flex flex-col font-sans">
        <Suspense fallback={<AppBarPlaceholder />}>
          <AppBar />
        </Suspense>
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
