import { describe, expect, it } from "vitest";
import {
  TOKEN_NAME_REQUIRED_MESSAGE,
  TOKEN_NAME_TOO_LONG_MESSAGE,
} from "@cpg/core/validators/api-tokens/create-api-token.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { errorFormatter, fieldErrorFormatter, formatMinute, tokensLabels, withName } from "./labels";

describe("tokens labels", () => {
  it("merge the screen's error meanings over the shared ones", () => {
    const { errors } = tokensLabels(en);

    expect(errors.CONFLICT).toBe("You already have a token with that name.");
    expect(errors.UNAUTHORIZED).toBe(en.errors.UNAUTHORIZED);
  });

  it("translate error envelopes, keeping the server's text for unknown codes", () => {
    const format = errorFormatter(tokensLabels(pl));

    expect(format({ code: "TOKEN_NOT_FOUND", message: "No such token." })).toBe("Ten token już nie istnieje.");
    expect(format({ code: "SOMETHING_NEW", message: "Server text." })).toBe("Server text.");
  });

  it("translate the schema's field messages and pass unknown ones through", () => {
    const format = fieldErrorFormatter(tokensLabels(pl));

    expect(format(TOKEN_NAME_REQUIRED_MESSAGE)).toBe("Podaj nazwę.");
    expect(format(TOKEN_NAME_TOO_LONG_MESSAGE)).toBe("Użyj co najwyżej 64 znaków.");
    expect(format("Something else.")).toBe("Something else.");
  });

  it("fill the name placeholder and show times in UTC to the minute", () => {
    expect(withName("Revoke {name}?", "agent1")).toBe("Revoke agent1?");
    expect(formatMinute(new Date("2026-10-19T11:40:59Z"))).toBe("2026-10-19 11:40 UTC");
  });
});
