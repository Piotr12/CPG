import {
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
} from "@cpg/core/validators/users/create-user.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { errorFormatter, fieldErrorFormatter, withUsername } from "./labels";

describe("users labels", () => {
  it("fills in the username everywhere it appears", () => {
    expect(withUsername("{username} is {username}", "alice")).toBe("alice is alice");
  });

  it("says known errors the users screen's way, and keeps the server's text for others", () => {
    const format = errorFormatter(pl.users);

    expect(format({ code: "CONFLICT", message: "That username is taken." })).toBe("Ta nazwa użytkownika jest zajęta.");
    expect(format({ code: "TOO_MANY_ATTEMPTS", message: "Slow down." })).toBe("Slow down.");
  });

  it("translates the shared schema's messages, which English already matches", () => {
    const polish = fieldErrorFormatter(pl.users);
    const english = fieldErrorFormatter(en.users);

    expect(polish(USERNAME_FORMAT_MESSAGE)).toBe(pl.users.fieldErrors.usernameFormat);
    expect(polish(PASSWORD_TOO_SHORT_MESSAGE)).toBe(pl.users.fieldErrors.passwordTooShort);
    expect(polish(PASSWORD_TOO_LONG_MESSAGE)).toBe(pl.users.fieldErrors.passwordTooLong);
    expect(polish("Something new.")).toBe("Something new.");
    for (const message of [USERNAME_FORMAT_MESSAGE, PASSWORD_TOO_SHORT_MESSAGE, PASSWORD_TOO_LONG_MESSAGE]) {
      expect(english(message)).toBe(message);
    }
  });
});
