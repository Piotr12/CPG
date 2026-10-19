import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiResult } from "../api/result";
import { CrudForm, type CrudField, type FormSchema } from "./crud-form";

const fields: CrudField[] = [
  { name: "username", label: "Username", autoComplete: "off" },
  { name: "password", label: "Password", type: "password", description: "At least 12 characters." },
];

/** A stand-in for a Zod schema: the password needs 12 characters. */
const schema: FormSchema = {
  safeParse: (data) => {
    const { password } = data as { password: string };
    return password.length >= 12
      ? { success: true }
      : {
          success: false,
          error: {
            issues: [
              { path: ["password"], message: "Use at least 12 characters." },
              { path: ["password"], message: "A second message is not shown." },
              { path: [], message: "Form-level issues are left to the server." },
            ],
          },
        };
  },
};

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("CrudForm", () => {
  it("renders one input per field, with types, hints and no cancel by default", () => {
    render(<CrudForm fields={fields} action={vi.fn()} submitLabel="Create user" />);

    expect(screen.getByLabelText("Username").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Username").getAttribute("autocomplete")).toBe("off");
    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("type")).toBe("password");
    expect(document.getElementById(password.getAttribute("aria-describedby")!)!.textContent).toBe(
      "At least 12 characters.",
    );
    expect(screen.getByLabelText("Username").hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("checks the schema first and shows the first message under the field, without calling the action", () => {
    const action = vi.fn();
    render(<CrudForm fields={fields} schema={schema} action={action} submitLabel="Create user" />);

    fill("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    const password = screen.getByLabelText("Password");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(password.getAttribute("aria-describedby")!)!.textContent).toBe(
      "Use at least 12 characters.",
    );
    expect(screen.queryByText("At least 12 characters.")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("sends the values, shows the pending label and reports success", async () => {
    let resolve!: (result: ApiResult<{ id: string }>) => void;
    const action = vi.fn(() => new Promise<ApiResult<{ id: string }>>((done) => (resolve = done)));
    const onSuccess = vi.fn();
    render(
      <CrudForm
        fields={fields}
        schema={schema}
        action={action}
        submitLabel="Create user"
        pendingLabel="Creating…"
        onSuccess={onSuccess}
      />,
    );

    fill("Username", "alice");
    fill("Password", "a long password");
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(action).toHaveBeenCalledWith({ username: "alice", password: "a long password" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Creating…" }).hasAttribute("disabled")).toBe(true));
    await act(async () => resolve({ ok: true, data: { id: "u1" } }));
    expect(onSuccess).toHaveBeenCalledWith({ id: "u1" });
    expect(screen.getByRole("button", { name: "Create user" })).toBeTruthy();
  });

  it("puts server field errors under their field, and other errors above the buttons", async () => {
    const action = vi
      .fn<(values: Record<string, string>) => Promise<ApiResult<never>>>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "CONFLICT", message: "Some fields are invalid.", fieldErrors: { username: ["That username is taken."] } },
      })
      .mockResolvedValueOnce({ ok: false, error: { code: "FORBIDDEN", message: "You don't have access to this." } })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { userId: ["Invalid"] } },
      });
    render(<CrudForm fields={fields} action={action} submitLabel="Create user" />);
    const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    submit();
    expect(await screen.findByText("That username is taken.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    submit();
    expect((await screen.findByRole("alert")).textContent).toBe("You don't have access to this.");
    expect(screen.queryByText("That username is taken.")).toBeNull();

    submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Some fields are invalid."));
  });

  it("clears earlier errors once a submit succeeds", async () => {
    const action = vi
      .fn<(values: Record<string, string>) => Promise<ApiResult<null>>>()
      .mockResolvedValueOnce({ ok: false, error: { code: "INTERNAL", message: "Something went wrong. Try again." } })
      .mockResolvedValueOnce({ ok: true, data: null });
    render(<CrudForm fields={fields} action={action} submitLabel="Save" />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("clears a server error when the schema stops the next submit", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: { code: "INTERNAL", message: "Boom." } });
    render(<CrudForm fields={fields} schema={schema} action={action} submitLabel="Save" />);

    fill("Password", "a long password");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fill("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits on Cmd/Ctrl+Enter and cancels on Escape or the Cancel button", async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: null });
    const onCancel = vi.fn();
    render(<CrudForm fields={fields} action={action} submitLabel="Save" onCancel={onCancel} />);
    const input = screen.getByLabelText("Username");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(action).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("ignores Escape when there is nothing to cancel", () => {
    render(<CrudForm fields={fields} action={vi.fn()} submitLabel="Save" />);

    expect(fireEvent.keyDown(screen.getByLabelText("Username"), { key: "Escape" })).toBe(true);
  });
});
