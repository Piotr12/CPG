import {
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
} from "@cpg/core/validators/users/create-user.schema";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { errorFormatter, fieldErrorFormatter, usersLabels, withUsername } from "./labels";

describe("users labels", () => {
  it("fills in the username everywhere it appears", () => {
    expect(withUsername("{username} is {username}", "alice")).toBe("alice is alice");
  });

  it("says known errors the users screen's way, and keeps the server's text for others", () => {
    const format = errorFormatter(usersLabels(pl));

    expect(format({ code: "CONFLICT", message: "That username is taken." })).toBe("Ta nazwa użytkownika jest zajęta.");
    expect(format({ code: "INTERNAL", message: "Something went wrong. Try again." })).toBe(pl.errors.INTERNAL);
    expect(format({ code: "SOMETHING_NEW", message: "Slow down." })).toBe("Slow down.");
  });

  it("translates the shared schema's messages, which English already matches", () => {
    const polish = fieldErrorFormatter(usersLabels(pl));
    const english = fieldErrorFormatter(usersLabels(en));

    expect(polish(USERNAME_FORMAT_MESSAGE)).toBe(pl.users.fieldErrors.usernameFormat);
    expect(polish(PASSWORD_TOO_SHORT_MESSAGE)).toBe(pl.users.fieldErrors.passwordTooShort);
    expect(polish(PASSWORD_TOO_LONG_MESSAGE)).toBe(pl.users.fieldErrors.passwordTooLong);
    expect(polish("Something new.")).toBe("Something new.");
    for (const message of [USERNAME_FORMAT_MESSAGE, PASSWORD_TOO_SHORT_MESSAGE, PASSWORD_TOO_LONG_MESSAGE]) {
      expect(english(message)).toBe(message);
    }
  });

  it("merges the screen's own error meanings over the shared ones", () => {
    const { errors } = usersLabels(en);

    expect(errors.CONFLICT).toBe(en.users.errors.CONFLICT);
    expect(errors.UNAUTHORIZED).toBe(en.errors.UNAUTHORIZED);
  });
});
