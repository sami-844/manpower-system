/**
 * Sidebar structure (Design Brief "Layouts": Dashboard, Workers, Compliance, Clients, Roster,
 * Timesheets, Payroll, Billing, Finance, Reports, Settings). Items point at paths in screens.tsx;
 * each group is shown only to roles that can see its area.
 */
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheckIcon,
  Building2Icon,
  CalendarClockIcon,
  ChartColumnIcon,
  CheckCheckIcon,
  HardHatIcon,
  HouseIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  PrinterIcon,
  ReceiptTextIcon,
  Settings2Icon,
  UsersRoundIcon,
  WalletCardsIcon,
} from "lucide-react";
import type { Area } from "@/lib/roles";

export interface NavItem {
  title: string;
  path: string;
}
export interface NavGroup {
  title: string;
  icon: LucideIcon;
  area: Area;
  /** A single link (no children) or a group with children. */
  path?: string;
  items?: NavItem[];
}

export const NAV_OVERVIEW: NavGroup[] = [
  { title: "Today", icon: HouseIcon, area: "today", path: "/" },
  { title: "Dashboard", icon: LayoutDashboardIcon, area: "insight", path: "/dashboard" },
  { title: "Approvals", icon: CheckCheckIcon, area: "insight", path: "/approvals" },
];

export const NAV_MODULES: NavGroup[] = [
  { title: "Workers", icon: UsersRoundIcon, area: "workforce", items: [{ title: "All workers", path: "/workers" }, { title: "New worker", path: "/workers/new" }, { title: "Document upload", path: "/documents/upload" }] },
  { title: "Compliance", icon: BadgeCheckIcon, area: "compliance", items: [{ title: "Renewals", path: "/renewals" }, { title: "Government transactions", path: "/gov-transactions" }, { title: "Overrides", path: "/overrides" }] },
  { title: "Clients", icon: Building2Icon, area: "commercial", items: [{ title: "All clients", path: "/clients" }, { title: "Contracts & rate cards", path: "/contracts" }] },
  { title: "Roster", icon: HardHatIcon, area: "operations", items: [{ title: "Manpower requests", path: "/requests" }, { title: "Roster board", path: "/roster" }, { title: "Bench", path: "/bench" }] },
  { title: "Timesheets", icon: CalendarClockIcon, area: "time", items: [{ title: "Daily sheets", path: "/daily-sheets" }, { title: "Attendance entry", path: "/attendance" }, { title: "Timesheets", path: "/timesheets" }, { title: "Client packs", path: "/timesheet-packs" }, { title: "Leave", path: "/leave" }] },
  { title: "Payroll", icon: WalletCardsIcon, area: "payroll", items: [{ title: "Payroll runs", path: "/payroll" }, { title: "WPS files", path: "/wps" }, { title: "Advances & loans", path: "/loans" }, { title: "Exit & settlement", path: "/exits" }] },
  { title: "Billing", icon: ReceiptTextIcon, area: "billing", items: [{ title: "Invoices", path: "/invoices" }, { title: "Receivables", path: "/receivables" }] },
  { title: "Finance", icon: LandmarkIcon, area: "finance", items: [{ title: "Ledger & close", path: "/ledger" }, { title: "Supplier bills", path: "/supplier-bills" }] },
  { title: "Reports", icon: ChartColumnIcon, area: "reports", path: "/reports" },
];

export const NAV_SETTINGS: NavGroup[] = [
  { title: "Settings", icon: Settings2Icon, area: "admin", items: [{ title: "Users & roles", path: "/admin/users" }, { title: "Rule tables", path: "/admin/rules" }, { title: "Audit & health", path: "/admin/audit" }] },
  { title: "Printers", icon: PrinterIcon, area: "desktop", path: "/printers" },
];
