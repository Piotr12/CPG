import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerComponents } from "../../../../../tests/setup/server-components";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { TenantStrip, TenantStripText } from "./tenant-strip";

const mocks = vi.hoisted(() => ({ connection: vi.fn(), getMessages: vi.fn() }));
vi.mock("@cpg/core", () => ({ TENANT_CODES: ["test", "prod"], TENANT_NAMES: { test: "Test", prod: "Prod" } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/test/materials" }));
vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("../../i18n/get-messages", () => ({ getMessages: mocks.getMessages }));

const as = (locale: "en" | "pl") => mocks.getMessages.mockResolvedValue({ locale, messages: locale === "en" ? en : pl });

describe("TenantStrip", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([
    ["test", "TEST", "Test tenant — demonstration data, safe to experiment", "bg-amber-200", "Test"],
    ["prod", "PROD", "Prod tenant — live data", "bg-neutral-900", "Prod"],
  ] as const)("shows the %s tenant in words and colour (TEN-011)", async (scope, label, text, colour, current) => {
    as("en");

    render(await resolveServerComponents(TenantStrip({ scope })));

    const strip = screen.getByRole("region", { name: `${label} ${text}` });
    expect(strip.dataset.tenant).toBe(scope);
    expect(strip.className).toContain(colour);
    expect(within(strip).getByText(text).getAttribute("lang")).toBe("en");
    expect(within(strip).getByRole("link", { name: current }).getAttribute("aria-current")).toBe("page");
  });

  it("shows pages outside any tenant as Global, with links to both tenants", async () => {
    as("en");

    render(await resolveServerComponents(TenantStrip({ scope: "global" })));

    const strip = screen.getByRole("region", { name: "GLOBAL Global — no tenant selected" });
    expect(within(strip).getByText("Global — no tenant selected")).toBeTruthy();
    expect(within(strip).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("aria-current")])).toEqual([
      ["Test", null],
      ["Prod", null],
    ]);
  });

  it("describes the scope in the reader's language, at request time", async () => {
    as("pl");

    render(await TenantStripText({ scope: "prod" }));

    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(screen.getByText("Środowisko Prod — dane rzeczywiste").getAttribute("lang")).toBe("pl");
  });
});
