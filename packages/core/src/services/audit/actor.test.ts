import { describe, expect, it } from "vitest";
import { apiActor, callerActor, uiActor } from "./actor";

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

const tokenCaller = { userId: "u-1", username: "alice", role: "user" as const, tokenId: "t-1", tokenName: "ci-bot" };

describe("apiActor", () => {
  it("attributes a token's change to its account and the token itself, on the API channel, with no session", () => {
    expect(apiActor(tokenCaller)).toEqual({
      userId: "u-1",
      username: "alice",
      sessionId: null,
      channel: "api",
      token: { id: "t-1", name: "ci-bot" },
    });
  });
});

describe("callerActor", () => {
  it("picks the token actor for a bearer caller and the session actor otherwise", () => {
    expect(callerActor(tokenCaller).channel).toBe("api");
    expect(callerActor({ sessionId: "s-1", userId: "u-1", username: "alice", role: "user" }).channel).toBe("ui");
  });
});
