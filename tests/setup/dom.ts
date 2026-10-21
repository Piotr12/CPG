import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(cleanup);

// jsdom has no ResizeObserver; Radix primitives (the shadcn checkbox inside a form) measure with it.
// A no-op is enough: unit tests never assert on layout.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
