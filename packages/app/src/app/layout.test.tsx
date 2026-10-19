import { Suspense, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppBar, AppBarPlaceholder } from "../components/layout/app-bar";
import { AppFooter } from "../components/layout/app-footer";
import { THEME_SCRIPT } from "../preferences/theme";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));
vi.mock("../components/layout/app-bar", () => ({ AppBar: () => null, AppBarPlaceholder: () => null }));

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

  it("renders the request-time app bar, then the page, then the footer", () => {
    const [, body] = layout().props.children;

    expect(body.type).toBe("body");
    const [slot, page, footer] = body.props.children;
    expect(slot.type).toBe(Suspense);
    expect(slot.props.fallback).toEqual(<AppBarPlaceholder />);
    expect((slot.props.children as unknown as Element).type).toBe(AppBar);
    expect(page).toEqual(<p>page</p>);
    expect(footer.type).toBe(AppFooter);
  });

  it("sets the site title", () => {
    expect(metadata.title).toBe("Caveman Planning Good");
  });
});
