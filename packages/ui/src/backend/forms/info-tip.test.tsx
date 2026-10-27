import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/dialog";
import { HOVER_CLOSE_DELAY_MS, InfoTip } from "./info-tip";

const TEXT = "In kg, the material's base unit, to six decimals.";

/** The tip inside a real dialog and form, as every quantity field has it; the form records submits and keys. */
function renderInDialog(onKeyDown: Mock = vi.fn(), onSubmit: Mock = vi.fn((event: Event) => event.preventDefault())) {
  render(
    <Dialog open>
      {/* Opened by a click: the dialog's own first focus is not keyboard focus (see the test below). */}
      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle>Change planning parameters</DialogTitle>
        <DialogDescription>Values in kg.</DialogDescription>
        <form onKeyDown={(event) => onKeyDown(event.defaultPrevented, event.key)} onSubmit={(event) => onSubmit(event.nativeEvent)}>
          <InfoTip label="About Minimum lot" className="ml-1">
            {TEXT}
          </InfoTip>
          <input aria-label="Minimum lot" />
        </form>
      </DialogContent>
    </Dialog>,
  );
  return { button: screen.getByRole("button", { name: "About Minimum lot" }), onKeyDown, onSubmit };
}

/** The visible copy: the Popover content, which only exists while the tip is open. */
const visible = () => document.querySelector<HTMLElement>("[data-slot=popover-content]");

afterEach(() => {
  vi.useRealTimers();
});

describe("InfoTip", () => {
  it("names the field and describes it with the text, even while closed; the visible copy is hidden from readers", () => {
    const { button } = renderInDialog();

    expect(button.getAttribute("type")).toBe("button");
    expect(button.dataset.variant).toBe("ghost");
    expect(button.parentElement!.className).toContain("ml-1");
    expect(button.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(button.getAttribute("aria-expanded")).toBeNull();
    expect(document.getElementById(button.getAttribute("aria-describedby")!)!.textContent).toBe(TEXT);
    expect(visible()).toBeNull();

    act(() => button.focus());

    expect(visible()!.textContent).toBe(TEXT);
    expect(visible()!.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders without extra classes", () => {
    render(<InfoTip label="About Base unit">{TEXT}</InfoTip>);
    expect(screen.getByRole("button", { name: "About Base unit" }).parentElement!.className.trim()).toBe("inline-flex");
  });

  it("opens on focus without moving it, and closes on blur unless focus moves into the text", () => {
    const { button } = renderInDialog();

    act(() => button.focus());
    expect(visible()).not.toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.blur(button, { relatedTarget: visible() });
    expect(visible()).not.toBeNull();
    fireEvent.blur(visible()!, { relatedTarget: button });
    expect(visible()).not.toBeNull();

    fireEvent.blur(button, { relatedTarget: screen.getByLabelText("Minimum lot") });
    expect(visible()).toBeNull();
  });

  it("doesn't open on focus that isn't keyboard focus, such as a dialog focusing its first control", () => {
    const { button } = renderInDialog();
    vi.spyOn(button, "matches").mockReturnValue(false);

    act(() => button.focus());

    expect(button.matches).toHaveBeenCalledWith(":focus-visible");
    expect(visible()).toBeNull();
  });

  it("ignores a blur while closed, as after a mouse focus", () => {
    const { button } = renderInDialog();
    vi.spyOn(button, "matches").mockReturnValue(false);
    act(() => button.focus());

    fireEvent.blur(button, { relatedTarget: screen.getByLabelText("Minimum lot") });

    expect(visible()).toBeNull();
  });

  it("closes when focus leaves the text for another control", () => {
    const { button } = renderInDialog();
    act(() => button.focus());
    fireEvent.blur(button, { relatedTarget: visible() });

    fireEvent.blur(visible()!, { relatedTarget: screen.getByLabelText("Minimum lot") });

    expect(visible()).toBeNull();
  });

  it("pins on a click and closes on a second one, even while focused", () => {
    const { button } = renderInDialog();

    fireEvent.click(button);
    expect(visible()).not.toBeNull();
    fireEvent.click(button);
    expect(visible()).toBeNull();

    // A tap focuses the button first (Android): focus then click leaves it open, a second tap closes it.
    act(() => button.focus());
    fireEvent.click(button);
    expect(visible()).not.toBeNull();
    fireEvent.click(button);
    expect(visible()).toBeNull();
  });

  it("never submits the form it sits in", () => {
    const { button, onSubmit } = renderInDialog();

    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("opens on a mouse hover and closes a moment after the pointer leaves, unless it moves onto the text", () => {
    vi.useFakeTimers();
    const { button } = renderInDialog();

    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    expect(visible()).not.toBeNull();

    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    fireEvent.pointerEnter(visible()!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS));
    expect(visible()).not.toBeNull();

    fireEvent.pointerLeave(visible()!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(HOVER_CLOSE_DELAY_MS - 1));
    expect(visible()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(visible()).toBeNull();
  });

  it("stays open when hovered and then clicked, and a second click closes it while still hovered", () => {
    const { button } = renderInDialog();

    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.click(button);
    expect(visible()).not.toBeNull();

    fireEvent.click(button);
    expect(visible()).toBeNull();
  });

  it("ignores touch pointers for hover: a finger opens it by tapping", () => {
    const { button } = renderInDialog();

    fireEvent.pointerEnter(button, { pointerType: "touch" });
    expect(visible()).toBeNull();

    fireEvent.click(button);
    fireEvent.pointerLeave(button, { pointerType: "touch" });
    expect(visible()).not.toBeNull();
  });

  it("a press on the button is not a press outside: hover then press pins it; a press elsewhere closes it", async () => {
    const { button } = renderInDialog();
    const press = (target: HTMLElement) => {
      fireEvent.pointerDown(target);
      fireEvent.click(target);
    };
    // Radix starts listening for outside presses a tick after the tip opens.
    const tick = () => act(() => new Promise((done) => setTimeout(done, 0)));

    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    await tick();
    // Were the button "outside", Radix would dismiss on this press's click, right after it pinned the tip.
    press(button);
    expect(visible()).not.toBeNull();

    press(button);
    expect(visible()).toBeNull();

    press(button);
    await tick();
    press(screen.getByLabelText("Minimum lot"));
    expect(visible()).toBeNull();
  });

  it("closes on Escape and leaves the dialog open, handing the form a key it must not act on", () => {
    const { button, onKeyDown } = renderInDialog();
    fireEvent.click(button);

    fireEvent.keyDown(button, { key: "Escape" });

    expect(visible()).toBeNull();
    expect(screen.getByRole("dialog", { name: "Change planning parameters" })).not.toBeNull();
    expect(onKeyDown).toHaveBeenLastCalledWith(true, "Escape");
  });

  it("clears a pending close when it unmounts", () => {
    vi.useFakeTimers();
    const set = vi.spyOn(globalThis, "setTimeout");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { unmount } = render(<InfoTip label="About Base unit">{TEXT}</InfoTip>);
    const button = screen.getByRole("button", { name: "About Base unit" });
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    fireEvent.pointerLeave(button, { pointerType: "mouse" });
    const pending = set.mock.results[set.mock.calls.findIndex(([, delay]) => delay === HOVER_CLOSE_DELAY_MS)].value;
    clear.mockClear();

    unmount();

    expect(clear).toHaveBeenCalledWith(pending);
  });

  it("closes even a pinned tip when focus moves to another control", () => {
    const { button } = renderInDialog();
    act(() => button.focus());
    fireEvent.click(button);
    expect(visible()).not.toBeNull();

    act(() => screen.getByLabelText("Minimum lot").focus());

    expect(visible()).toBeNull();
  });
});
