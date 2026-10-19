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

  it("speaks the caller's language: cancel, form errors and field errors", async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: { code: "CONFLICT", message: "Taken." } });
    render(
      <CrudForm
        fields={fields}
        schema={schema}
        action={action}
        submitLabel="Zapisz"
        cancelLabel="Anuluj"
        onCancel={vi.fn()}
        formatError={({ code }) => `błąd ${code}`}
        formatFieldError={(message) => `pole: ${message}`}
      />,
    );

    expect(screen.getByRole("button", { name: "Anuluj" })).toBeTruthy();
    fill("Password", "short");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(screen.getByText("pole: Use at least 12 characters.")).toBeTruthy();

    fill("Password", "a long password");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect((await screen.findByRole("alert")).textContent).toBe("błąd CONFLICT");
  });

  describe("select fields and initial values", () => {
    const typeField: CrudField = {
      name: "type",
      label: "Type",
      type: "select",
      placeholder: "Choose a type",
      options: [
        { value: "raw", label: "Raw" },
        { value: "finished", label: "Finished" },
      ],
      description: "What the material is.",
    };

    it("offers the options after an unselectable placeholder and submits the chosen value", async () => {
      const action = vi.fn(async (): Promise<ApiResult<string>> => ({ ok: true, data: "ok" }));
      render(<CrudForm fields={[typeField]} action={action} submitLabel="Create" />);

      const select = screen.getByLabelText("Type") as HTMLSelectElement;
      expect(select.tagName).toBe("SELECT");
      expect(select.value).toBe("");
      expect(screen.getByRole("option", { name: "Choose a type" })).toHaveProperty("disabled", true);
      expect(document.getElementById(select.getAttribute("aria-describedby")!)!.textContent).toBe("What the material is.");

      fireEvent.change(select, { target: { value: "finished" } });
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create" })));

      expect(action).toHaveBeenCalledWith({ type: "finished" });
    });

    it("shows a field error on a select too", () => {
      const required: FormSchema = {
        safeParse: (data) =>
          (data as { type: string }).type
            ? { success: true }
            : { success: false, error: { issues: [{ path: ["type"], message: "Choose one." }] } },
      };
      render(<CrudForm fields={[{ ...typeField, placeholder: undefined }]} schema={required} action={vi.fn()} submitLabel="Create" />);

      expect(screen.queryByRole("option", { name: "Choose a type" })).toBeNull();
      fireEvent.change(screen.getByLabelText("Type"), { target: { value: "" } });
      fireEvent.click(screen.getByRole("button", { name: "Create" }));

      expect(screen.getByLabelText("Type").getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText("Choose one.")).toBeTruthy();
    });

    it("renders a select without options as empty", () => {
      render(<CrudForm fields={[{ name: "unit", label: "Unit", type: "select" }]} action={vi.fn()} submitLabel="Save" />);

      expect(screen.queryAllByRole("option")).toEqual([]);
    });

    it("starts from the given values, such as the record an edit form changes", async () => {
      const action = vi.fn(async (): Promise<ApiResult<string>> => ({ ok: true, data: "ok" }));
      render(
        <CrudForm
          fields={[typeField, { name: "description", label: "Description" }]}
          initialValues={{ type: "raw", description: "Bolt M8" }}
          action={action}
          submitLabel="Save"
        />,
      );

      expect((screen.getByLabelText("Type") as HTMLSelectElement).value).toBe("raw");
      expect((screen.getByLabelText("Description") as HTMLInputElement).value).toBe("Bolt M8");
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));

      expect(action).toHaveBeenCalledWith({ type: "raw", description: "Bolt M8" });
    });
  });
});
