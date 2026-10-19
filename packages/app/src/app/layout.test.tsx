import { describe, expect, it, vi } from "vitest";
import { AppFooter } from "../components/layout/app-footer";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));

describe("RootLayout", () => {
  it("wraps the page in <html lang=en> with both font variables", () => {
    const html = RootLayout({ children: <p>page</p>, params: Promise.resolve({}) });

    expect(html.type).toBe("html");
    expect(html.props.lang).toBe("en");
    expect(html.props.className).toContain("font-geist-sans font-geist-mono");
    expect(html.props.children.type).toBe("body");
    expect(html.props.children.props.children[0]).toEqual(<p>page</p>);
  });

  it("ends every page with the app footer", () => {
    const html = RootLayout({ children: <p>page</p>, params: Promise.resolve({}) });

    const body = html.props.children.props.children;
    expect(body.at(-1)).toEqual(<AppFooter />);
  });

  it("sets the site title", () => {
    expect(metadata.title).toBe("Caveman Planning Good");
  });
});
