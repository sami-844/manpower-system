/**
 * Every Version 1 screen (App Flow "Screen inventory", S-01 … S-41) in one table. The router,
 * sidebar, breadcrumbs and Ctrl+K palette are all built from it, so adding a screen is one line.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Area } from "@/lib/roles";

type Loader = () => Promise<Record<string, unknown>>;
const page = (load: Loader, name: string): LazyExoticComponent<ComponentType> =>
  lazy(async () => ({ default: (await load())[name] as ComponentType }));

export interface Screen {
  id: string;
  path: string;
  title: string;
  area: Area;
  Component: LazyExoticComponent<ComponentType>;
  /** Detail screens name their list screen so the breadcrumb reads "Workers › Worker file". */
  parent?: string;
  /** Desktop-only screens (TR-CLI-07) are hidden on the plain web app. */
  desktopOnly?: boolean;
  /** Words Ctrl+K should also match. */
  keywords?: string;
}

export const SCREENS: Screen[] = [
  // Shell
  { id: "S-02", path: "/", title: "Today", area: "today", Component: page(() => import("@/pages/Today"), "Today"), keywords: "home queue tasks" },
  { id: "S-04", path: "/notifications", title: "Notifications", area: "today", Component: page(() => import("@/pages/shell/Notifications"), "Notifications"), keywords: "alerts messages" },

  // Insight
  { id: "S-32", path: "/dashboard", title: "Owner dashboard", area: "insight", Component: page(() => import("@/pages/insight/OwnerDashboard"), "OwnerDashboard"), keywords: "kpi cash margin headcount" },
  { id: "S-33", path: "/approvals", title: "Approvals", area: "insight", Component: page(() => import("@/pages/insight/Approvals"), "Approvals"), keywords: "inbox approve four eyes" },
  { id: "S-34", path: "/reports", title: "Reports", area: "reports", Component: page(() => import("@/pages/insight/Reports"), "Reports"), keywords: "export excel pdf" },

  // Workforce
  { id: "S-05", path: "/workers", title: "Workers", area: "workforce", Component: page(() => import("@/pages/Workers"), "Workers"), keywords: "employees staff list" },
  { id: "S-07", path: "/workers/new", title: "New worker", area: "workforce", parent: "/workers", Component: page(() => import("@/pages/workforce/NewWorker"), "NewWorker"), keywords: "create add passport ocr" },
  { id: "S-06", path: "/workers/:id", title: "Worker file", area: "workforce", parent: "/workers", Component: page(() => import("@/pages/WorkerFile"), "WorkerFile") },
  { id: "S-08", path: "/documents/upload", title: "Document upload", area: "workforce", Component: page(() => import("@/pages/workforce/DocumentUpload"), "DocumentUpload"), keywords: "scan passport visa verify" },

  // Compliance
  { id: "S-09", path: "/renewals", title: "Renewals", area: "compliance", Component: page(() => import("@/pages/Renewals"), "Renewals"), keywords: "expiry expiring visa labour card" },
  { id: "S-10", path: "/gov-transactions", title: "Government transactions", area: "compliance", Component: page(() => import("@/pages/compliance/GovTransactions"), "GovTransactions"), keywords: "pro ministry visa application" },
  { id: "S-11", path: "/overrides", title: "Overrides", area: "compliance", Component: page(() => import("@/pages/compliance/Overrides"), "Overrides"), keywords: "exception approve" },

  // Commercial
  { id: "S-12", path: "/clients", title: "Clients", area: "commercial", Component: page(() => import("@/pages/commercial/Clients"), "Clients"), keywords: "customers credit" },
  { id: "S-13", path: "/clients/:id", title: "Client file", area: "commercial", parent: "/clients", Component: page(() => import("@/pages/commercial/ClientFile"), "ClientFile") },
  { id: "S-14", path: "/contracts", title: "Contracts & rate cards", area: "commercial", Component: page(() => import("@/pages/commercial/Contracts"), "Contracts"), keywords: "rates overtime pricing" },
  { id: "S-14", path: "/contracts/:id", title: "Contract and rate card", area: "commercial", parent: "/contracts", Component: page(() => import("@/pages/commercial/ContractDetail"), "ContractDetail") },

  // Operations
  { id: "S-15", path: "/requests", title: "Manpower requests", area: "operations", Component: page(() => import("@/pages/operations/Requests"), "Requests"), keywords: "orders demand" },
  { id: "S-16", path: "/requests/:id/match", title: "Match workers", area: "operations", parent: "/requests", Component: page(() => import("@/pages/operations/MatchWorkers"), "MatchWorkers") },
  { id: "S-17", path: "/roster", title: "Roster board", area: "operations", Component: page(() => import("@/pages/operations/Roster"), "Roster"), keywords: "assign schedule deploy" },
  { id: "S-18", path: "/bench", title: "Bench", area: "operations", Component: page(() => import("@/pages/operations/Bench"), "Bench"), keywords: "idle available" },

  // Time
  { id: "S-39", path: "/daily-sheets", title: "Daily sheets", area: "time", Component: page(() => import("@/pages/time/DailySheets"), "DailySheets"), keywords: "print attendance sheet qr" },
  { id: "S-40", path: "/attendance", title: "Attendance entry", area: "time", Component: page(() => import("@/pages/time/AttendanceEntry"), "AttendanceEntry"), keywords: "timekeeper grid absent sick late overtime" },
  { id: "S-19", path: "/timesheets", title: "Timesheets", area: "time", Component: page(() => import("@/pages/time/Timesheets"), "Timesheets"), keywords: "hours approval lock" },
  { id: "S-20", path: "/timesheets/:id", title: "Timesheet detail", area: "time", parent: "/timesheets", Component: page(() => import("@/pages/time/TimesheetDetail"), "TimesheetDetail") },
  { id: "S-41", path: "/timesheet-packs", title: "Client timesheet packs", area: "time", Component: page(() => import("@/pages/time/TimesheetPacks"), "TimesheetPacks"), keywords: "email client sign approval" },
  { id: "S-21", path: "/leave", title: "Leave", area: "time", Component: page(() => import("@/pages/time/Leave"), "Leave"), keywords: "vacation balance travel" },

  // Payroll
  { id: "S-22", path: "/payroll", title: "Payroll runs", area: "payroll", Component: page(() => import("@/pages/payroll/PayrollRuns"), "PayrollRuns"), keywords: "salary pay period" },
  { id: "S-23", path: "/payroll/:id", title: "Payroll review", area: "payroll", parent: "/payroll", Component: page(() => import("@/pages/payroll/PayrollReview"), "PayrollReview") },
  { id: "S-24", path: "/payslips/:id", title: "Payslip", area: "payroll", parent: "/payroll", Component: page(() => import("@/pages/payroll/Payslip"), "Payslip") },
  { id: "S-25", path: "/wps", title: "WPS files", area: "payroll", Component: page(() => import("@/pages/payroll/WpsFiles"), "WpsFiles"), keywords: "bank muscat sif salary file" },
  { id: "S-26", path: "/loans", title: "Advances & loans", area: "payroll", Component: page(() => import("@/pages/payroll/Loans"), "Loans"), keywords: "advance instalment" },
  { id: "S-27", path: "/exits", title: "Exit & settlement", area: "payroll", Component: page(() => import("@/pages/payroll/Exits"), "Exits"), keywords: "end of service gratuity resignation" },

  // Billing
  { id: "S-28", path: "/invoices", title: "Invoices", area: "billing", Component: page(() => import("@/pages/billing/Invoices"), "Invoices"), keywords: "billing vat credit note" },
  { id: "S-28", path: "/invoices/:id", title: "Invoice", area: "billing", parent: "/invoices", Component: page(() => import("@/pages/billing/InvoiceDetail"), "InvoiceDetail") },
  { id: "S-29", path: "/receivables", title: "Receivables", area: "billing", Component: page(() => import("@/pages/billing/Receivables"), "Receivables"), keywords: "ageing overdue collections dso" },

  // Finance
  { id: "S-30", path: "/ledger", title: "Ledger & close", area: "finance", Component: page(() => import("@/pages/finance/Ledger"), "Ledger"), keywords: "journal trial balance month end reconciliation" },
  { id: "S-31", path: "/supplier-bills", title: "Supplier bills", area: "finance", Component: page(() => import("@/pages/finance/SupplierBills"), "SupplierBills"), keywords: "camp rent fuel visa fees" },

  // Admin
  { id: "S-36", path: "/admin/users", title: "Users & roles", area: "admin", Component: page(() => import("@/pages/admin/Users"), "Users"), keywords: "accounts permissions" },
  { id: "S-37", path: "/admin/rules", title: "Rule tables", area: "admin", Component: page(() => import("@/pages/admin/Rules"), "Rules"), keywords: "overtime leave legal versions" },
  { id: "S-38", path: "/admin/audit", title: "Audit & health", area: "admin", Component: page(() => import("@/pages/admin/Audit"), "Audit"), keywords: "chain integration log" },

  // Desktop
  { id: "S-35", path: "/printers", title: "Printers", area: "desktop", desktopOnly: true, Component: page(() => import("@/pages/Printers"), "Printers"), keywords: "silent print" },
];

export const screenByPath = (path: string) => SCREENS.find((s) => s.path === path);
