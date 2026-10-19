import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages, MESSAGES } from "./get-messages";
import { en } from "./messages/en";
import { pl } from "./messages/pl";

const mocks = vi.hoisted(() => ({ currentPreferences: vi.fn() }));
vi.mock("../preferences/current-preferences", () => ({ currentPreferences: mocks.currentPreferences }));

describe("getMessages", () => {
  afterEach(() => vi.clearAllMocks());

  it("knows English and Polish", () => {
    expect(MESSAGES).toEqual({ en, pl });
  });

  it.each([
    ["en", en],
    ["pl", pl],
  ] as const)("hands out the %s dictionary for an account that chose it", async (locale, messages) => {
    mocks.currentPreferences.mockResolvedValue({ locale, theme: "light" });

    await expect(getMessages()).resolves.toEqual({ locale, messages });
  });
});
