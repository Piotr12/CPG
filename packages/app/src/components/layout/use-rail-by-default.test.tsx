import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RAIL_QUERY, useRailByDefault } from "./use-rail-by-default";

function Probe({ setOpen }: { setOpen: (open: boolean) => void }) {
  useRailByDefault(true, setOpen);
  return <p>sidebar</p>;
}

/** An 800 px window: only the rail band's query matches. */
function railViewport() {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query === RAIL_QUERY,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("useRailByDefault", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("applies nothing on the server, then folds to the rail once the hydrated client knows the width", async () => {
    railViewport();
    const setOpen = vi.fn();
    const html = renderToString(<Probe setOpen={setOpen} />);
    expect(setOpen).not.toHaveBeenCalled();

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const root = await act(async () => hydrateRoot(container, <Probe setOpen={setOpen} />));

    expect(setOpen).toHaveBeenCalledExactlyOnceWith(false);
    act(() => root.unmount());
  });
});
