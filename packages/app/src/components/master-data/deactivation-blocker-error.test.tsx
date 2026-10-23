import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { deactivationBlockerError } from "./deactivation-blocker-error";

afterEach(cleanup);

type Refusal = { code: string; message: string; params?: Record<string, string> };

const BLOCKERS: (Required<Pick<Refusal, "code" | "params">> & { href: string })[] = [
  { code: "LOCATION_HAS_PRODUCTION_ORDERS", params: { order: "00000017" }, href: "/admin/prod/production-orders/00000017" },
  { code: "MATERIAL_HAS_PRODUCTION_ORDERS", params: { order: "00000017" }, href: "/admin/prod/production-orders/00000017" },
  { code: "LOCATION_HAS_OPEN_TRANSFERS", params: { transfer: "00000003" }, href: "/admin/prod/transfers/00000003" },
  { code: "MATERIAL_IN_OPEN_TRANSFER", params: { transfer: "00000003" }, href: "/admin/prod/transfers/00000003" },
];

it("links each blocking document after its translated refusal, in English and Polish (LFC-018)", () => {
  for (const messages of [en, pl]) {
    const format = deactivationBlockerError(messages, "prod");
    for (const { code, params, href } of BLOCKERS) {
      const id = Object.values(params)[0];
      const { container } = render(<p>{format({ code, message: "Blocked", params })}</p>);
      expect(screen.getByRole("link", { name: id }).getAttribute("href")).toBe(href);
      expect(container.textContent).toBe(`${messages.errors[code as keyof typeof messages.errors].replace(/\{\w+\}/, id)} ${id}`);
      cleanup();
    }
  }
  render(<p>{deactivationBlockerError(pl, "prod")({ code: "LOCATION_HAS_OPEN_TRANSFERS", message: "Blocked", params: { transfer: "00000003" } })}</p>);
  expect(screen.getByRole("paragraph").textContent).toBe("Przesunięcie 00000003 z tej lub do tej lokalizacji jest nadal otwarte. 00000003");
});

it("links nothing for another refusal, a missing or malformed ID, or the other document's parameter", () => {
  const format = deactivationBlockerError({ errors: { LOCATION_HAS_OPEN_TRANSFERS: "Open transfer {transfer}" } }, "prod");
  const refusals: Refusal[] = [
    { code: "OTHER", message: "Other", params: { transfer: "00000003" } },
    { code: "constructor", message: "Inherited key", params: { transfer: "00000003", order: "00000003" } },
    { code: "LOCATION_HAS_OPEN_TRANSFERS", message: "No context" },
    { code: "LOCATION_HAS_OPEN_TRANSFERS", message: "Bad", params: { transfer: "../../admin" } },
    { code: "LOCATION_HAS_OPEN_TRANSFERS", message: "Wrong parameter", params: { order: "00000003" } },
    { code: "MATERIAL_HAS_PRODUCTION_ORDERS", message: "Wrong parameter", params: { transfer: "00000003" } },
  ];
  for (const error of refusals) {
    render(<>{format(error)}</>);
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
  }
  render(<p>{format({ code: "LOCATION_HAS_OPEN_TRANSFERS", message: "Bad", params: { transfer: "../../admin" } })}</p>);
  expect(screen.getByRole("paragraph").textContent).toBe("Open transfer ../../admin");
});
