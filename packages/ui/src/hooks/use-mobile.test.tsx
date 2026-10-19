import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

/** jsdom has no matchMedia: a stub whose "change" listeners the test can fire. */
function stubViewport(width: number) {
  const listeners = new Set<() => void>();
  window.innerWidth = width;
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  });
  return {
    listeners,
    resize(to: number) {
      window.innerWidth = to;
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useIsMobile", () => {
  afterEach(() => {
    window.innerWidth = 1024;
  });

  it("is true below 768 px, false from 768 px, and follows the viewport", () => {
    const viewport = stubViewport(390);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767px)");

    act(() => viewport.resize(768));
    expect(result.current).toBe(false);

    unmount();
    expect(viewport.listeners.size).toBe(0);
  });

  it("is false when rendered on the server, whatever the client's width will be", () => {
    stubViewport(390);
    function Probe() {
      return <>{String(useIsMobile())}</>;
    }
    expect(renderToString(<Probe />)).toBe("false");
  });

  it("is false on a desktop viewport", () => {
    stubViewport(1280);
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });
});
