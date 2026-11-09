import type { DocumentType, EligibilityResult, RenewalStatus, WorkerComplianceSummary } from "@mms/core";
import { currentUser } from "./user";

export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // The hosted demo (Cloudflare, `vite build --mode demo`) has no API server: answer in the browser.
  // Vite replaces MODE at build time, so other builds drop this branch and the stand-in entirely.
  if (import.meta.env.MODE === "demo") {
    const { demoServer } = await import("@/demo/server");
    return demoServer().handle<T>(method, path, body, currentUser());
  }
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-user": currentUser() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const issues = data?.issues ?? data?.message?.issues ?? [];
    const message = typeof data?.message === "string" ? data.message : (data?.message?.message ?? res.statusText);
    throw new ApiError(res.status, message, issues);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

export interface WorkerListItem {
  id: string;
  code: string;
  fullName: string;
  nationality: string;
  trade: string;
  status: string;
  compliance: WorkerComplianceSummary;
}

export interface WorkerDocumentView {
  id: string;
  type: DocumentType;
  number: string | null;
  issueDate?: string | null;
  expiryDate: string | null;
  verified: boolean;
  verifiedBy?: string | null;
  renewal: RenewalStatus | null;
}

export interface WorkerDetail extends WorkerListItem {
  phone: string | null;
  joinedOn?: string | null;
  documents: WorkerDocumentView[];
  leave: { id: string; fromDate: string; toDate: string }[];
}

export interface Site {
  id: string;
  code: string;
  name: string;
  clientName: string;
  requiredDocuments?: DocumentType[];
}

export interface RenewalItem extends RenewalStatus {
  id: string;
  workerId: string;
  workerName: string;
  workerCode: string;
  type: DocumentType;
  expiryDate: string;
}

export interface DashboardSummary {
  today: string;
  headcount: number;
  byStatus: Record<string, number>;
  byCompliance: Record<"ok" | "due" | "incomplete" | "expired", number>;
  expiringIn30Days: number;
}

export type { EligibilityResult };
