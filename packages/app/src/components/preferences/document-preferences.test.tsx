import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentPreferences } from "./document-preferences";

const root = document.documentElement;
const cookieWrites = () => vi.spyOn(document, "cookie", "set");

describe("DocumentPreferences", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    root.className = "";
    root.lang = "";
    document.cookie = "cpg_theme=; Max-Age=0; Path=/";
  });

  it("applies the account's language and dark theme to <html> and remembers the theme", () => {
    render(<DocumentPreferences locale="pl" theme="dark" isSignedIn />);

    expect(root.lang).toBe("pl");
    expect(root.classList.contains("dark")).toBe(true);
    expect(document.cookie).toContain("cpg_theme=dark");
  });

  it("removes a stale dark class when the account chose light", () => {
    root.classList.add("dark");
    document.cookie = "cpg_theme=dark; Path=/";

    render(<DocumentPreferences locale="en" theme="light" isSignedIn />);

    expect(root.classList.contains("dark")).toBe(false);
    expect(document.cookie).toContain("cpg_theme=light");
  });

  it("leaves a cookie that already matches alone", () => {
    document.cookie = "cpg_theme=dark; Path=/";
    const writes = cookieWrites();

    render(<DocumentPreferences locale="en" theme="dark" isSignedIn />);

    expect(writes).not.toHaveBeenCalled();
  });

  it("forgets the theme for a visitor, so signed-out pages are light", () => {
    document.cookie = "cpg_theme=dark; Path=/";

    render(<DocumentPreferences locale="en" theme="light" isSignedIn={false} />);

    expect(document.cookie).not.toContain("cpg_theme");
  });

  it("marks the cookie secure over HTTPS", () => {
    vi.spyOn(window, "location", "get").mockReturnValue({ protocol: "https:" } as Location);
    const writes = cookieWrites();

    render(<DocumentPreferences locale="en" theme="dark" isSignedIn />);

    expect(writes).toHaveBeenCalledWith("cpg_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  it("renders nothing", () => {
    const { container } = render(<DocumentPreferences locale="en" theme="light" isSignedIn={false} />);

    expect(container.innerHTML).toBe("");
  });
});
