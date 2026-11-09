/**
 * Bridge to the Tauri desktop shell. On the plain website these features are absent,
 * and the interface hides them rather than failing.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type RenderMode = "direct" | "post_script";
export interface PrinterProfile {
  printer: string;
  mode: RenderMode;
}
export interface PrinterInfo {
  name: string;
  is_default: boolean;
  driver: string;
}
export interface BatchReport {
  submitted: [string, number][];
  failed: [string, string][];
  cancelled: boolean;
  not_started: number;
}
export interface PrintProgress {
  done: number;
  total: number;
  current: string;
}

export const JOB_TYPES = [
  { key: "payslips", label: "Payslips" },
  { key: "id_cards", label: "ID cards" },
  { key: "labels", label: "Labels" },
  { key: "documents", label: "Letters and statements" },
] as const;
export type JobType = (typeof JOB_TYPES)[number]["key"];

export const isDesktop = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

export const desktop = {
  listPrinters: () => invoke<PrinterInfo[]>("list_printers"),
  printTestPage: (profile: PrinterProfile) => invoke<BatchReport>("print_test_page", { profile }),
  printDocuments: (profile: PrinterProfile, documents: { name: string; pdf_base64: string }[]) =>
    invoke<BatchReport>("print_documents", { profile, documents }),
  cancelPrinting: () => invoke<void>("cancel_printing"),
  onProgress: (handler: (p: PrintProgress) => void) => listen<PrintProgress>("print-progress", (e) => handler(e.payload)),
};

const KEY = "mms.printers";

export function savedProfiles(): Partial<Record<JobType, PrinterProfile>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveProfile(job: JobType, profile: PrinterProfile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...savedProfiles(), [job]: profile }));
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}
