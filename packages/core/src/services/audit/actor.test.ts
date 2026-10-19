import { describe, expect, it } from "vitest";
import { uiActor } from "./actor";

describe("uiActor", () => {
  it("attributes a screen change to the session's account and the session itself, on the UI channel", () => {
    expect(uiActor({ sessionId: "s-1", userId: "u-1", username: "alice", role: "user" })).toEqual({
      userId: "u-1",
      username: "alice",
      sessionId: "s-1",
      channel: "ui",
      token: null,
    });
  });
});
