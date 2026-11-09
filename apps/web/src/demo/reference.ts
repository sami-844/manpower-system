/**
 * DEMO DATA — shared reference records every module uses: clients, sites, contracts with rate
 * cards. Fictional companies and places (see ./core.ts). The first three sites match the API seed
 * (`apps/api/src/db/seed.ts`) by code so real and sample screens agree.
 */
import { omr, roundBaisa } from "@mms/core";

export const TRADES = ["General labourer", "Mason", "Carpenter", "Steel fixer", "Electrician", "Plumber", "Scaffolder", "Welder", "Equipment operator", "Driver"] as const;
export type Trade = (typeof TRADES)[number];

export type ClientStatus = "active" | "on_hold" | "prospect";
export interface Client {
  id: string;
  code: string;
  legalName: string;
  crNumber: string;
  vatNumber: string;
  creditLimit: string;
  paymentTermsDays: number;
  status: ClientStatus;
  city: string;
  contacts: { name: string; email: string; phone: string; canApproveTimesheets: boolean }[];
}

export interface Site {
  id: string;
  code: string;
  name: string;
  clientId: string;
  city: string;
  requiredDocuments: string[];
  supervisor: string;
}

export type HourType = "normal" | "overtime" | "rest_day" | "holiday" | "night";
export interface RateLine {
  trade: Trade;
  hourType: HourType;
  unit: "hour";
  rate: string;
}
export interface RateCard {
  id: string;
  version: number;
  validFrom: string;
  validTo: string | null;
  approvedBy: string | null;
  lines: RateLine[];
}
export interface Contract {
  id: string;
  reference: string;
  clientId: string;
  startDate: string;
  endDate: string;
  autoApproveDays: number;
  minBillableHours: number;
  escalationDate: string | null;
  charges: { kind: "accommodation" | "transport" | "mobilisation" | "other"; amount: string; frequency: "monthly" | "once" }[];
  rateCards: RateCard[];
}

export const CLIENTS: Client[] = [
  { id: "cl-01", code: "C-0001", legalName: "Gulf Build LLC", crNumber: "CR-DEMO-10021", vatNumber: "VAT-DEMO-4401", creditLimit: "60000.000", paymentTermsDays: 45, status: "active", city: "Sohar", contacts: [{ name: "Majid Al Saadi", email: "majid@gulfbuild.example", phone: "+968 9000 1101", canApproveTimesheets: true }, { name: "Rekha Pillai", email: "accounts@gulfbuild.example", phone: "+968 9000 1102", canApproveTimesheets: false }] },
  { id: "cl-02", code: "C-0002", legalName: "Al Noor Contracting", crNumber: "CR-DEMO-10388", vatNumber: "VAT-DEMO-4519", creditLimit: "45000.000", paymentTermsDays: 30, status: "active", city: "Muscat", contacts: [{ name: "Hamed Al Kindi", email: "hamed@alnoor.example", phone: "+968 9000 1201", canApproveTimesheets: true }] },
  { id: "cl-03", code: "C-0003", legalName: "Batinah Steel Fabrication", crNumber: "CR-DEMO-10412", vatNumber: "VAT-DEMO-4630", creditLimit: "30000.000", paymentTermsDays: 30, status: "active", city: "Sohar", contacts: [{ name: "Vikram Rao", email: "vikram@batinahsteel.example", phone: "+968 9000 1301", canApproveTimesheets: true }] },
  { id: "cl-04", code: "C-0004", legalName: "Coastal Marine Works", crNumber: "CR-DEMO-10577", vatNumber: "VAT-DEMO-4702", creditLimit: "40000.000", paymentTermsDays: 60, status: "active", city: "Duqm", contacts: [{ name: "Salim Al Hinai", email: "salim@coastalmarine.example", phone: "+968 9000 1401", canApproveTimesheets: true }] },
  { id: "cl-05", code: "C-0005", legalName: "Wadi Infrastructure Co.", crNumber: "CR-DEMO-10690", vatNumber: "VAT-DEMO-4815", creditLimit: "25000.000", paymentTermsDays: 45, status: "on_hold", city: "Nizwa", contacts: [{ name: "Aisha Al Farsi", email: "aisha@wadiinfra.example", phone: "+968 9000 1501", canApproveTimesheets: true }] },
  { id: "cl-06", code: "C-0006", legalName: "Crescent Facilities Services", crNumber: "CR-DEMO-10734", vatNumber: "VAT-DEMO-4922", creditLimit: "20000.000", paymentTermsDays: 30, status: "active", city: "Muscat", contacts: [{ name: "George Mathew", email: "george@crescentfs.example", phone: "+968 9000 1601", canApproveTimesheets: true }] },
  { id: "cl-07", code: "C-0007", legalName: "Seeb Logistics Park", crNumber: "CR-DEMO-10851", vatNumber: "VAT-DEMO-5034", creditLimit: "15000.000", paymentTermsDays: 30, status: "prospect", city: "Seeb", contacts: [{ name: "Nasser Al Abri", email: "nasser@seeblogistics.example", phone: "+968 9000 1701", canApproveTimesheets: false }] },
];

export const SITES: Site[] = [
  { id: "st-01", code: "SOH-PORT", name: "Sohar Port Phase 3", clientId: "cl-01", city: "Sohar", requiredDocuments: [], supervisor: "Ahmed Rashid" },
  { id: "st-02", code: "MCT-TWR", name: "Muscat Tower Block B", clientId: "cl-02", city: "Muscat", requiredDocuments: ["trade_certificate"], supervisor: "Imran Qureshi" },
  { id: "st-03", code: "SOH-IND", name: "Sohar Industrial Yard", clientId: "cl-03", city: "Sohar", requiredDocuments: ["driving_licence"], supervisor: "Bikash Thapa" },
  { id: "st-04", code: "SOH-WHF", name: "Sohar Wharf Extension", clientId: "cl-01", city: "Sohar", requiredDocuments: [], supervisor: "Ravi Menon" },
  { id: "st-05", code: "DQM-BRK", name: "Duqm Breakwater", clientId: "cl-04", city: "Duqm", requiredDocuments: [], supervisor: "Joseph Das" },
  { id: "st-06", code: "NZW-RD7", name: "Nizwa Road 7 Upgrade", clientId: "cl-05", city: "Nizwa", requiredDocuments: ["driving_licence"], supervisor: "Karim Hossain" },
  { id: "st-07", code: "MCT-HOS", name: "Bausher Clinic Fit-out", clientId: "cl-06", city: "Muscat", requiredDocuments: [], supervisor: "Anil Kumar" },
  { id: "st-08", code: "MCT-MAL", name: "Qurum Mall Maintenance", clientId: "cl-06", city: "Muscat", requiredDocuments: [], supervisor: "Suresh Nair" },
];

/** Base hourly billing rates by trade (normal hours); other hour types are multiples. */
const BASE_RATE: Record<Trade, string> = {
  "General labourer": "1.100",
  Mason: "1.450",
  Carpenter: "1.450",
  "Steel fixer": "1.500",
  Electrician: "1.750",
  Plumber: "1.650",
  Scaffolder: "1.400",
  Welder: "1.800",
  "Equipment operator": "2.100",
  Driver: "1.350",
};
const MULT: Record<HourType, string> = { normal: "1", overtime: "1.25", rest_day: "1.5", holiday: "2", night: "1.25" };

function rateLines(uplift: string): RateLine[] {
  const lines: RateLine[] = [];
  for (const trade of TRADES) {
    for (const hourType of Object.keys(MULT) as HourType[]) {
      const rate = roundBaisa(omr(BASE_RATE[trade]).times(MULT[hourType]).times(uplift)).toFixed(3);
      lines.push({ trade, hourType, unit: "hour", rate });
    }
  }
  return lines;
}

export const CONTRACTS: Contract[] = CLIENTS.filter((c) => c.status !== "prospect").map((c, i) => ({
  id: `ct-0${i + 1}`,
  reference: `MSA-2026-${String(41 + i * 7).padStart(3, "0")}`,
  clientId: c.id,
  startDate: i % 2 ? "2026-03-01" : "2026-01-01",
  endDate: i % 2 ? "2027-02-28" : "2027-12-31",
  autoApproveDays: [3, 5, 7][i % 3]!,
  minBillableHours: [8, 8, 9][i % 3]!,
  escalationDate: i % 2 ? "2027-01-01" : null,
  charges: [
    { kind: "accommodation", amount: "35.000", frequency: "monthly" },
    { kind: "transport", amount: "12.000", frequency: "monthly" },
  ],
  rateCards: [
    { id: `rc-0${i + 1}-1`, version: 1, validFrom: i % 2 ? "2026-03-01" : "2026-01-01", validTo: "2026-08-31", approvedBy: "finance.lead", lines: rateLines("1") },
    { id: `rc-0${i + 1}-2`, version: 2, validFrom: "2026-09-01", validTo: null, approvedBy: "owner.gm", lines: rateLines(["1.04", "1.03", "1.05", "1.025", "1.04", "1.03"][i] ?? "1.03") },
  ],
}));

export const clientById = (id: string) => CLIENTS.find((c) => c.id === id);
export const siteById = (id: string) => SITES.find((s) => s.id === id);
export const sitesOf = (clientId: string) => SITES.filter((s) => s.clientId === clientId);
export const contractOf = (clientId: string) => CONTRACTS.find((c) => c.clientId === clientId);
