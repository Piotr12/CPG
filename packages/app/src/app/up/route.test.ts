import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { connection, ping } = vi.hoisted(() => ({ connection: vi.fn(), ping: vi.fn() }));
vi.mock("next/server", () => ({ connection }));
vi.mock("@cpg/core", () => ({ requestScope: async () => ({ cradle: { systemStatusService: { ping } } }) }));

describe("GET /up", () => {
  afterEach(() => vi.clearAllMocks());

  it("answers OK once the database responds", async () => {
    const response = await GET();

    expect(connection).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(await response.text()).toBe("OK");
  });

  it("fails when the database does not respond", async () => {
    ping.mockRejectedValue(new Error("SQLITE_CANTOPEN"));

    await expect(GET()).rejects.toThrow("SQLITE_CANTOPEN");
  });
});
