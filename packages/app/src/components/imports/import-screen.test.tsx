import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORKBOOK_UNREADABLE_MESSAGE } from "@cpg/core/validators/imports/import-request.schema";
import { en } from "../../i18n/messages/en";
import { pl } from "../../i18n/messages/pl";
import { ImportScreen } from "./import-screen";
import { importLabels } from "./labels";
import { stockImportLabels } from "./stock-labels";

const mocks = vi.hoisted(() => ({ dryRunImport: vi.fn(), commitImport: vi.fn() }));
vi.mock("../../app/admin/[tenant]/import/actions", () => mocks);
const stockMocks = vi.hoisted(() => ({ dryRunStockImport: vi.fn(), commitStockImport: vi.fn() }));
vi.mock("../../app/admin/[tenant]/stock-import/actions", () => stockMocks);
const reads = vi.hoisted(() => ({ fileToBase64: vi.fn() }));
vi.mock("./base64", async (importOriginal) => {
  reads.fileToBase64.mockImplementation((await importOriginal<typeof import("./base64")>()).fileToBase64);
  return reads;
});
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a> }));

const TENANT = { code: "test", name: "Test", generation: 2, readOnly: false };
const TOKEN = "d".repeat(64);

const created = { sheet: "Materials", row: 2, action: "create", record: "00000007", label: "00000007 — Rod", changes: [{ field: "Type", before: null, after: "raw" }] };
const updated = { sheet: "BOM headers", row: 2, action: "update", record: "00000002", reference: "PANEL", label: "00000002 — 00000004 Panel", changes: [{ field: "Component 00000002", before: "16.000000 each", after: null }] };
const unchanged = { sheet: "Locations", row: 2, action: "unchanged", record: "00000001", label: "00000001 — Cave", changes: [] };
const SUMMARY = [{ sheet: "Materials", created: 1, updated: 0, unchanged: 0, errors: 0 }];
const clean = { committed: false, previewToken: TOKEN, summary: SUMMARY, rows: [created, updated, unchanged], errors: [] };

function renderScreen(tenant = TENANT, messages = en) {
  render(<ImportScreen tenant={tenant} labels={importLabels(messages)} />);
}

/** Chooses a file in the upload step, and waits until it is read. */
async function choose(size = 3, label = en.imports.upload.file) {
  const file = new File([new Uint8Array(size)], "masters.xlsx");
  await act(async () => {
    fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
  });
}

const button = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

describe("ImportScreen", () => {
  beforeEach(() => {
    mocks.dryRunImport.mockResolvedValue({ ok: true, data: clean });
    mocks.commitImport.mockResolvedValue({ ok: true, data: { ...clean, committed: true, previewToken: null } });
  });
  afterEach(() => vi.clearAllMocks());

  it("offers the template, and the dry run only once a file is chosen", async () => {
    renderScreen();

    expect(screen.getByRole("link", { name: "Download template (.xlsx)" }).getAttribute("href")).toBe("/api/import/template");
    expect(screen.getAllByRole("listitem")[0].getAttribute("aria-current")).toBe("step");
    expect(button("Run dry run").disabled).toBe(true);
    await choose();
    expect(button("Run dry run").disabled).toBe(false);
    expect(screen.getAllByRole("listitem")[1].getAttribute("aria-current")).toBe("step");
  });

  it("previews a clean dry run, then commits it in the bound tenant", async () => {
    renderScreen();
    await choose();
    fireEvent.click(button("Run dry run"));

    await screen.findByText("raw");
    expect(mocks.dryRunImport).toHaveBeenCalledWith("test", 2, { workbook: "AAAA" });
    expect(screen.getByText("00000002 — 00000004 Panel (PANEL)")).toBeTruthy();
    expect(screen.getByText("Component 00000002: 16.000000 each → removed")).toBeTruthy();
    expect(screen.queryByText("00000001 — Cave")).toBeNull();
    fireEvent.click(button("Show 1 unchanged row"));
    expect(screen.getByText("00000001 — Cave")).toBeTruthy();
    expect(screen.getByText(/All 2 changes are written to Test in one transaction/)).toBeTruthy();
    expect(screen.getAllByRole("listitem")[2].getAttribute("aria-current")).toBe("step");

    fireEvent.click(button("Commit 2 changes"));

    await screen.findByRole("status");
    expect(mocks.commitImport).toHaveBeenCalledWith("test", 2, { workbook: "AAAA", previewToken: TOKEN });
    expect(screen.getByRole("status").textContent).toBe("✓ Imported into Test: 1 created, 1 updated, 1 unchanged.");
    expect(screen.getByRole("link", { name: "00000007 — Rod" }).getAttribute("href")).toBe("/admin/test/materials/00000007");
    expect(screen.getByRole("link", { name: "00000002 — 00000004 Panel (PANEL)" }).getAttribute("href")).toBe("/admin/test/boms/00000002");

    fireEvent.click(button("Start another import"));
    expect(screen.queryByRole("status")).toBeNull();
    expect(button("Run dry run").disabled).toBe(true);
  });

  it("links each committed record to its page, or to its list", async () => {
    const row = (sheet: string, record: string) => ({ sheet, row: 2, action: "create", record, label: `${sheet} ${record}`, changes: [] });
    const rows = [
      row("Unit conversions", "00000002/case"),
      row("Locations", "00000003"),
      row("Customers", "00000004"),
      row("Suppliers", "00000005"),
      row("Planning parameters", "00000001/00000003"),
      row("Safety stock", "00000001/00000003/2027-01-01"),
    ];
    mocks.dryRunImport.mockResolvedValue({ ok: true, data: { ...clean, rows } });
    mocks.commitImport.mockResolvedValue({ ok: true, data: { ...clean, rows, committed: true, previewToken: null } });
    renderScreen();
    await choose();
    fireEvent.click(button("Run dry run"));
    fireEvent.click(await screen.findByRole("button", { name: "Commit 6 changes" }));
    await screen.findByRole("status");

    const href = (name: string) => screen.getByRole("link", { name }).getAttribute("href");
    expect(rows.map(({ label }) => href(label))).toEqual([
      "/admin/test/materials/00000002",
      "/admin/test/locations",
      "/admin/test/customers",
      "/admin/test/suppliers",
      "/admin/test/planning-parameters",
      "/admin/test/safety-stock",
    ]);
  });

  it("lists every problem and keeps the commit closed", async () => {
    mocks.dryRunImport.mockResolvedValue({
      ok: true,
      data: {
        ...clean,
        previewToken: null,
        summary: [{ sheet: "Materials", created: 0, updated: 0, unchanged: 0, errors: 2 }],
        rows: [],
        errors: [
          { sheet: "Materials", row: 4, column: "ID", code: "IMPORT_UNKNOWN_ID", message: "x", params: { id: "00009876", record: "material" } },
          { sheet: null, row: null, column: null, code: "IMPORT_EMPTY", message: "x" },
        ],
      },
    });
    renderScreen();
    await choose();
    fireEvent.click(button("Run dry run"));

    await screen.findByText(/2 problems found/);
    const problems = screen.getByRole("table", { name: "Problem" });
    expect(within(problems).getByText("Material 00009876 doesn't exist in Test. Leave the ID blank to create a new record.")).toBeTruthy();
    expect(within(problems).getAllByText("—")).toHaveLength(3);
    expect(button("Commit 0 changes").disabled).toBe(true);
  });

  it("says when a clean dry run changes nothing", async () => {
    mocks.dryRunImport.mockResolvedValue({ ok: true, data: { ...clean, rows: [unchanged] } });
    renderScreen();
    await choose();
    fireEvent.click(button("Run dry run"));

    expect((await screen.findAllByText("Nothing to change.")).length).toBeGreaterThan(0);
    expect(button("Commit 0 changes").disabled).toBe(true);
  });

  it("goes back to the dry run when the commit is stale, keeping the file", async () => {
    mocks.commitImport.mockResolvedValue({ ok: false, error: { code: "IMPORT_STALE", message: "Stale." } });
    renderScreen();
    await choose();
    fireEvent.click(button("Run dry run"));
    fireEvent.click(await screen.findByRole("button", { name: "Commit 2 changes" }));

    expect(await screen.findByText(en.imports.errors.IMPORT_STALE)).toBeTruthy();
    expect(button("Run dry run").disabled).toBe(false);
    expect(screen.queryByText("Component 00000002: 16.000000 each → removed")).toBeNull();
  });

  it("shows a request's refusal in the reader's language: a field error, or the code's", async () => {
    mocks.dryRunImport.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Some fields are invalid.", fieldErrors: { workbook: [WORKBOOK_UNREADABLE_MESSAGE] } },
    });
    renderScreen(TENANT, pl);
    await choose(3, pl.imports.upload.file);
    fireEvent.click(button(pl.imports.upload.run));
    expect(await screen.findByText(pl.imports.fieldErrors.workbookUnreadable)).toBeTruthy();

    mocks.dryRunImport.mockResolvedValueOnce({ ok: false, error: { code: "GENERATION_STALE", message: "Reset." } });
    fireEvent.click(button(pl.imports.upload.run));
    expect(await screen.findByText(pl.imports.errors.GENERATION_STALE)).toBeTruthy();

    mocks.dryRunImport.mockResolvedValueOnce({ ok: false, error: { code: "VALIDATION_FAILED", message: "x", fieldErrors: { workbook: ["Unforeseen."] } } });
    fireEvent.click(button(pl.imports.upload.run));
    expect(await screen.findByText("Unforeseen.")).toBeTruthy();
  });

  it("shows the pending state while the dry run runs", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.dryRunImport.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderScreen();
    await choose();
    fireEvent.click(button("Run dry run"));

    expect(button("Running the dry run…").disabled).toBe(true);
    expect((screen.getByLabelText(en.imports.upload.file) as HTMLInputElement).disabled).toBe(true);
    await act(async () => finish({ ok: true, data: clean }));
    expect(button("Run dry run").disabled).toBe(false);
  });

  it("dry-runs the file chosen last, even when an earlier choice is read later", async () => {
    let finishFirst: (value: string) => void = () => {};
    reads.fileToBase64.mockReturnValueOnce(new Promise((resolve) => (finishFirst = resolve))).mockResolvedValueOnce("U0VDT05E");
    renderScreen();
    await choose();
    await choose();
    await act(async () => finishFirst("RklSU1Q="));
    fireEvent.click(button("Run dry run"));

    await screen.findByText("raw");
    expect(mocks.dryRunImport).toHaveBeenCalledWith("test", 2, { workbook: "U0VDT05E" });
  });

  it("refuses a file over 512 KB before uploading it, and clears the choice", async () => {
    renderScreen();
    await choose(512 * 1024 + 1);

    expect(screen.getByText(en.imports.fieldErrors.workbookTooLarge)).toBeTruthy();
    expect(button("Run dry run").disabled).toBe(true);
    await act(async () => {
      fireEvent.change(screen.getByLabelText(en.imports.upload.file), { target: { files: [] } });
    });
    expect(screen.queryByText(en.imports.fieldErrors.workbookTooLarge)).toBeNull();
  });

  it("blocks the upload and the commit while the tenant is read-only", () => {
    renderScreen({ ...TENANT, readOnly: true });

    expect(screen.getByText(/Test is read-only: imports are blocked/)).toBeTruthy();
    expect((screen.getByLabelText(en.imports.upload.file) as HTMLInputElement).disabled).toBe(true);
    expect(button("Commit 0 changes").disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Download template (.xlsx)" })).toBeTruthy();
  });
});

describe("ImportScreen — the stock import", () => {
  const corrected = {
    sheet: "Stock",
    row: 2,
    action: "update",
    record: "00000001/00000002",
    label: "00000001 — Flint at 00000002 — River cave",
    changes: [
      { field: "Entered", before: null, after: "2.000000 case" },
      { field: "Physical quantity", before: "10.000000 each", after: "24.000000 each" },
      { field: "Movement", before: null, after: "+14.000000 each" },
    ],
  };
  const same = { sheet: "Stock", row: 3, action: "unchanged", record: "00000002/00000001", label: "00000002 — Hide at 00000001 — Main cave", changes: [] };
  const report = { committed: false, previewToken: TOKEN, summary: [{ sheet: "Stock", created: 0, updated: 1, unchanged: 1, errors: 0 }], rows: [corrected, same], errors: [] };

  const renderStock = (tenant = TENANT, messages = en) => render(<ImportScreen tenant={tenant} labels={stockImportLabels(messages)} kind="stock" />);

  beforeEach(() => {
    stockMocks.dryRunStockImport.mockResolvedValue({ ok: true, data: report });
    stockMocks.commitStockImport.mockResolvedValue({ ok: true, data: { ...report, committed: true, previewToken: null } });
  });
  afterEach(() => vi.clearAllMocks());

  it("previews each position's movement, with no Created column, through the stock actions", async () => {
    renderStock();
    expect(screen.getByRole("link", { name: "Download template (.xlsx)" }).getAttribute("href")).toBe("/api/stock-import/template");
    await choose();
    fireEvent.click(button("Run dry run"));

    await screen.findByText("Movement: +14.000000 each");
    expect(stockMocks.dryRunStockImport).toHaveBeenCalledWith("test", 2, { workbook: "AAAA" });
    expect(mocks.dryRunImport).not.toHaveBeenCalled();
    expect(screen.getByText("Entered: 2.000000 case")).toBeTruthy();
    expect(screen.getByText("Physical quantity: 10.000000 each → 24.000000 each")).toBeTruthy();
    expect(screen.getByText("Correct")).toBeTruthy();
    const summary = within(screen.getAllByRole("table")[0]);
    expect(summary.queryByText("Created")).toBeNull();
    expect(summary.getByText("Corrections")).toBeTruthy();
    expect(summary.getByText("No change")).toBeTruthy();
  });

  it("posts only once a reason is given, and sends it with the token (STX-014)", async () => {
    renderStock();
    await choose();
    fireEvent.click(button("Run dry run"));
    await screen.findByText("Movement: +14.000000 each");

    expect(button("Post 1 correction").disabled).toBe(true);
    const reason = screen.getByLabelText("Reason") as HTMLInputElement;
    expect(reason.placeholder).toBe("Opening balance");
    expect(reason.maxLength).toBe(500);
    expect(screen.getByText(en.stockImport.reason.hint)).toBeTruthy();
    fireEvent.change(reason, { target: { value: "   " } });
    expect(button("Post 1 correction").disabled).toBe(true);
    fireEvent.change(reason, { target: { value: " Stock count 2027-01 " } });
    expect(screen.getByText(/The movement is posted to Test with this reason/)).toBeTruthy();
    fireEvent.click(button("Post 1 correction"));

    await screen.findByRole("status");
    expect(stockMocks.commitStockImport).toHaveBeenCalledWith("test", 2, { workbook: "AAAA", previewToken: TOKEN, reason: " Stock count 2027-01 " });
    expect(screen.getByRole("status").textContent).toBe("✓ Posted to Test. Corrections: 1, unchanged: 1. Reason: Stock count 2027-01.");
    expect(screen.getByText("Corrected")).toBeTruthy();
    expect(screen.getByRole("link", { name: "00000001 — Flint at 00000002 — River cave" }).getAttribute("href")).toBe(
      "/admin/test/stock?material=00000001&location=00000002",
    );

    // Another workbook starts without the last import's reason.
    fireEvent.click(button(en.imports.commit.again));
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  });

  it("explains a stale commit and a missing reason in the reader's language", async () => {
    stockMocks.commitStockImport.mockResolvedValueOnce({ ok: false, error: { code: "IMPORT_STALE", message: "Stale." } });
    renderStock(TENANT, pl);
    await choose(3, pl.imports.upload.file);
    fireEvent.click(button(pl.imports.upload.run));
    fireEvent.change(await screen.findByLabelText("Powód"), { target: { value: "Inwentaryzacja" } });
    fireEvent.click(button("Zaksięguj 1 korektę"));
    expect(await screen.findByText(pl.stockImport.errors.IMPORT_STALE)).toBeTruthy();
    expect(screen.getAllByRole("listitem")[1].getAttribute("aria-current")).toBe("step");
    expect(screen.queryByText("Ruch: +14.000000 each")).toBeNull();

    stockMocks.commitStockImport.mockResolvedValueOnce({
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "x", fieldErrors: { reason: ["Enter a reason, up to 500 characters."] } },
    });
    fireEvent.click(button(pl.imports.upload.run));
    fireEvent.click(await screen.findByRole("button", { name: "Zaksięguj 1 korektę" }));
    expect(await screen.findByText(pl.stock.fieldErrors.reason)).toBeTruthy();
  });

  it("blocks the upload, the reason and the commit while the tenant is read-only", () => {
    renderStock({ ...TENANT, readOnly: true });

    expect(screen.getByText(/Test is read-only: stock imports are blocked/)).toBeTruthy();
    expect((screen.getByLabelText(en.imports.upload.file) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("Reason") as HTMLInputElement).disabled).toBe(true);
  });
});
