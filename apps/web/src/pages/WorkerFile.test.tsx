import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "@/lib/session";
import { WorkerFile } from "./WorkerFile";

const worker = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "W-000091",
  fullName: "Hasan Uddin",
  nationality: "Bangladesh",
  trade: "Steel fixer",
  status: "deployed",
  phone: "+968 91234567",
  compliance: { state: "expired", missing: [], nextExpiry: { type: "residence_visa", expiryDate: "2026-09-04", daysLeft: -40 } },
  documents: [
    { id: "d1", type: "residence_visa", number: "••••1234", expiryDate: "2026-09-04", verified: true, renewal: { state: "expired", daysLeft: -40, tier: 0 } },
    { id: "d2", type: "medical", number: null, expiryDate: "2027-05-01", verified: false, renewal: { state: "ok", daysLeft: 199, tier: null } },
  ],
  leave: [],
};

const sites = { items: [{ id: "22222222-2222-4222-8222-222222222222", code: "SOH-PORT", name: "Sohar Port Phase 3", clientName: "Gulf Build LLC" }] };

let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  calls = [];
  // Signed in as the HR officer: verifying documents is an HR action.
  localStorage.setItem("mms.user", "hr.officer");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const body = url.endsWith("/api/sites")
        ? sites
        : url.endsWith("/compliance/check")
          ? {
              eligible: false,
              blockers: [{ code: "DOCUMENT_EXPIRED", documentType: "residence_visa", message: "Residence visa expired on 2026-09-04" }],
              warnings: [{ code: "DOCUMENT_UNVERIFIED", documentType: "medical", message: "Medical fitness not yet verified by HR" }],
            }
          : url.includes("/verify")
            ? { ...worker.documents[1], verified: true }
            : worker;
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[`/workers/${worker.id}`]}>
            <Routes>
              <Route path="/workers/:id" element={<WorkerFile />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe("WorkerFile", () => {
  it("shows the worker and each document with its expiry in plain words", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Hasan Uddin" })).toBeInTheDocument();
    const docs = screen.getByRole("table", { name: "Documents" });
    expect(within(docs).getByText("Residence visa")).toBeInTheDocument();
    expect(within(docs).getByText("Expired 40 days ago")).toBeInTheDocument();
    expect(within(docs).getByText("••••1234")).toBeInTheDocument();
  });

  it("checks whether the worker can be deployed and lists every reason", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Hasan Uddin" });
    const user = userEvent.setup();
    await screen.findByRole("option", { name: "Sohar Port Phase 3" });
    await user.selectOptions(screen.getByLabelText("Site"), "Sohar Port Phase 3");
    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-11-01");
    await user.clear(screen.getByLabelText("To"));
    await user.type(screen.getByLabelText("To"), "2026-11-30");
    await user.click(screen.getByRole("button", { name: "Check eligibility" }));

    expect(await screen.findByText("Cannot be deployed")).toBeInTheDocument();
    expect(screen.getByText("Residence visa expired on 4 Sept 2026")).toBeInTheDocument();
    expect(screen.getByText("Medical fitness not yet verified by HR")).toBeInTheDocument();
    const check = calls.find((c) => c.url.endsWith("/compliance/check"));
    expect(JSON.parse(String(check?.init?.body))).toEqual({
      workerId: worker.id,
      siteId: sites.items[0]!.id,
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("lets HR verify an unverified document", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Hasan Uddin" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Verify Medical fitness" }));
    const verify = calls.find((c) => c.url.endsWith("/api/documents/d2/verify"));
    expect(verify?.init?.method).toBe("PATCH");
  });
});
