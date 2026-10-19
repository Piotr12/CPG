import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { en } from "../../i18n/messages/en";
import { SignInForm } from "./sign-in-form";

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
  fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
}

describe("SignInForm", () => {
  it("renders the credential fields with the right autocomplete hints", () => {
    render(<SignInForm action={vi.fn()} labels={en.login} />);

    expect(screen.getByLabelText("Username").getAttribute("autocomplete")).toBe("username");
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    expect(password.type).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits the form data and shows the action's error", async () => {
    const action = vi.fn(async () => ({ error: "Invalid username or password." }));
    render(<SignInForm action={action} labels={en.login} />);

    await act(async () => fillAndSubmit());

    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(formData.get("username")).toBe("admin");
    expect(formData.get("password")).toBe("wrong");
    expect(screen.getByRole("alert").textContent).toBe("Invalid username or password.");
  });

  it("disables the button while signing in", async () => {
    let finish: (state: object) => void = () => {};
    const action = vi.fn(() => new Promise<object>((resolve) => (finish = resolve)));
    render(<SignInForm action={action} labels={en.login} />);

    await act(async () => fillAndSubmit());
    const button = screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await act(async () => finish({}));
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
