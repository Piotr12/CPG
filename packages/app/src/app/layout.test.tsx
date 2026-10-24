import { Suspense, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@cpg/ui/components/sidebar";
import { TooltipProvider } from "@cpg/ui/components/tooltip";
import { AppSidebar, SidebarSkeleton } from "../components/layout/app-sidebar";
import { AppFooter } from "../components/layout/app-footer";
import { THEME_SCRIPT } from "../preferences/theme";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));
vi.mock("../components/layout/app-sidebar", () => ({ AppSidebar: () => null, SidebarSkeleton: () => null }));

type Element = ReactElement<{ children: Element[]; [prop: string]: unknown }>;
const layout = () => RootLayout({ children: <p>page</p>, params: Promise.resolve({}) }) as Element;

describe("RootLayout", () => {
  it("wraps the page in <html lang=en> with both font variables", () => {
    const html = layout();

    expect(html.type).toBe("html");
    expect(html.props.lang).toBe("en");
    expect(html.props.className).toContain("font-geist-sans font-geist-mono");
    // The head script and DocumentPreferences change <html> outside React.
    expect(html.props.suppressHydrationWarning).toBe(true);
  });

  it("paints the theme from the cookie before first paint", () => {
    const [head] = layout().props.children;

    expect(head.type).toBe("head");
    expect(head.props.children).toEqual(<script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />);
  });

  it("renders the request-time sidebar beside a content column holding the page, then the footer", () => {
    const [, body] = layout().props.children;

    expect(body.type).toBe("body");
    const [, tooltips] = body.props.children;
    expect(tooltips.type).toBe(TooltipProvider);
    const provider = tooltips.props.children as unknown as Element;
    expect(provider.type).toBe(SidebarProvider);
    // A column below md, a row from md, and a column again when the visitor bar stands in for the sidebar.
    expect(provider.props.className).toBe("flex-col md:flex-row md:has-[[data-visitor-bar]]:flex-col");
    const [slot, column] = provider.props.children;
    expect(slot.type).toBe(Suspense);
    expect(slot.props.fallback).toEqual(<SidebarSkeleton />);
    expect((slot.props.children as unknown as Element).type).toBe(AppSidebar);
    const [page, footer] = column.props.children;
    expect(column.props["data-content-column"]).toBe(true);
    expect(page).toEqual(<p>page</p>);
    expect(footer.type).toBe(AppFooter);
  });

  it("tells a reader without JavaScript to turn it on, in both languages, before the page (D5)", () => {
    const [, body] = layout().props.children;
    const [notice] = body.props.children;

    expect(notice.type).toBe("noscript");
    const markup = renderToStaticMarkup(notice);
    expect(markup).toContain('<p lang="en">CPG needs JavaScript. Turn it on in your browser and reload this page.</p>');
    expect(markup).toContain('<p lang="pl">CPG wymaga JavaScriptu. Włącz go w przeglądarce i odśwież tę stronę.</p>');
    // Styled as a warning Callout, a note rather than an alert: it doesn't block reading.
    expect(markup).toContain('data-slot="callout" data-tone="warning" role="note"');
  });

  it("sets the site title", () => {
    expect(metadata.title).toBe("Caveman Planning Good");
  });
});
