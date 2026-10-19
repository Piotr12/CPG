import { describe, expect, it } from "vitest";
import { clientIpFrom } from "./client-ip";

describe("clientIpFrom", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 , 10.0.0.1", "203.0.113.7"],
    ["", "unknown"],
    [" , 10.0.0.1", "unknown"],
  ])("reads %j as %s", (forwardedFor, ip) => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": forwardedFor }))).toBe(ip);
  });

  it("falls back when the header is missing", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
