import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args), isTauri: () => true }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));

const { Printers } = await import("./Printers");

beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "list_printers") {
      return [
        { name: "Office HP LaserJet", is_default: true, driver: "HP Universal" },
        { name: "Evolis Card Printer", is_default: false, driver: "Evolis" },
      ];
    }
    if (cmd === "print_test_page") return { submitted: [["Workforce printer test", 7]], failed: [], cancelled: false, not_started: 0 };
    throw new Error(`unexpected ${cmd}`);
  });
});
afterEach(() => vi.clearAllMocks());

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Printers />
    </QueryClientProvider>,
  );
}

describe("Printers (desktop only)", () => {
  it("lists printers connected to this PC and preselects the Windows default", async () => {
    renderPage();
    const payslips = await screen.findByLabelText("Payslips printer");
    expect(payslips).toHaveValue("Office HP LaserJet");
    expect(screen.getAllByRole("option", { name: "Evolis Card Printer" }).length).toBeGreaterThan(0);
  });

  it("remembers the printer chosen for each kind of job on this PC", async () => {
    renderPage();
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText("ID cards printer"), "Evolis Card Printer");
    expect(JSON.parse(localStorage.getItem("mms.printers") ?? "{}")).toMatchObject({
      id_cards: { printer: "Evolis Card Printer", mode: "direct" },
    });
  });

  it("prints a test page silently and confirms it was sent", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByLabelText("Payslips printer");
    await user.click(screen.getByRole("button", { name: "Print test page on Payslips printer" }));
    expect(invoke).toHaveBeenCalledWith("print_test_page", { profile: { printer: "Office HP LaserJet", mode: "direct" } });
    expect(await screen.findByText("Test page sent to Office HP LaserJet.")).toBeInTheDocument();
  });

  it("shows the reason when printing fails", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_printers") return [{ name: "Office HP LaserJet", is_default: true, driver: "HP" }];
      throw 'Printer "Office HP LaserJet" isn\'t connected to this PC';
    });
    renderPage();
    const user = userEvent.setup();
    await screen.findByLabelText("Payslips printer");
    await user.click(screen.getByRole("button", { name: "Print test page on Payslips printer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't connected to this PC");
  });
});
