/**
 * S-08 Document upload (App Flow "new worker to deployable", steps 2 and 3). Scans are dropped
 * into a queue and kept in this browser's memory only (file storage arrives with S3 in its
 * sprint); each one is matched to a REAL worker, typed and dated, then saved through
 * `POST /api/workers/:id/documents` and verified through `PATCH /api/documents/:id/verify`.
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DOCUMENT_TYPES, documentLabel, type DocumentType } from "@mms/core";
import { ArrowUpRightIcon, BadgeCheckIcon, FileTextIcon, FileUpIcon, LoaderCircleIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { userLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useWorkforce } from "@/demo/workforce";
import { Page, PageHeader } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NativeSelect, WorkerPicker } from "./shared";

type ScanStatus = "draft" | "saving" | "saved" | "verifying" | "verified" | "error";
interface Scan {
  id: string;
  name: string;
  size: number;
  kind: "image" | "pdf";
  url: string;
  workerId: string | null;
  type: DocumentType;
  number: string;
  issueDate: string;
  expiryDate: string;
  status: ScanStatus;
  docId?: string;
  savedBy?: string;
  error?: string;
}

const STATUS: Record<ScanStatus, { tone: StatusTone; label: string }> = {
  draft: { tone: "draft", label: "To check" },
  saving: { tone: "info", label: "Saving" },
  saved: { tone: "due", label: "Saved · not verified" },
  verifying: { tone: "info", label: "Verifying" },
  verified: { tone: "ok", label: "Verified" },
  error: { tone: "expired", label: "Needs attention" },
};

/** Guess the type from the file name ("passport-W-000123.jpg"), so a well-named batch needs fewer clicks. */
function guessType(name: string): DocumentType {
  const n = name.toLowerCase();
  if (n.includes("visa")) return "residence_visa";
  if (n.includes("labour") || n.includes("labor")) return "labour_card";
  if (n.includes("medic")) return "medical";
  if (n.includes("civil")) return "civil_id";
  if (n.includes("licen")) return "driving_licence";
  return "passport";
}

const kb = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ready = (s: Scan) => s.status === "draft" && !!s.workerId && !!s.expiryDate;

export function DocumentUpload() {
  const qc = useQueryClient();
  const { account } = useSession();
  const workforce = useWorkforce();
  const [scans, setScans] = useState<Scan[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const urls = useRef(new Set<string>());
  const canVerify = account?.role === "hr_pro" || account?.role === "admin";

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const patch = (id: string, change: Partial<Scan>) => setScans((all) => all.map((s) => (s.id === id ? { ...s, ...change } : s)));

  const addFiles = (files: FileList | null) => {
    const accepted = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (files && accepted.length < files.length) toast.warning("Only images and PDFs can be added", { description: `${files.length - accepted.length} file(s) skipped.` });
    if (!accepted.length) return;
    const added = accepted.map((f): Scan => {
      const url = URL.createObjectURL(f);
      urls.current.add(url);
      return { id: crypto.randomUUID(), name: f.name, size: f.size, kind: f.type === "application/pdf" ? "pdf" : "image", url, workerId: null, type: guessType(f.name), number: "", issueDate: "", expiryDate: "", status: "draft" };
    });
    setScans((all) => [...all, ...added]);
    setSelectedId((cur) => cur ?? added[0]!.id);
  };

  const remove = (s: Scan) => {
    URL.revokeObjectURL(s.url);
    urls.current.delete(s.url);
    setScans((all) => all.filter((x) => x.id !== s.id));
    setSelectedId((cur) => (cur === s.id ? null : cur));
  };

  const invalidate = (workerId: string) => {
    void qc.invalidateQueries({ queryKey: ["workers"] });
    void qc.invalidateQueries({ queryKey: ["worker", workerId] });
    void qc.invalidateQueries({ queryKey: ["renewals"] });
  };

  const save = useMutation({
    mutationFn: (s: Scan) =>
      api.post<{ id: string }>(`/api/workers/${s.workerId}/documents`, {
        type: s.type,
        number: s.number || undefined,
        issueDate: s.issueDate || undefined,
        expiryDate: s.expiryDate || null,
      }),
    onMutate: (s) => patch(s.id, { status: "saving", error: undefined }),
    onSuccess: (doc, s) => {
      patch(s.id, { status: "saved", docId: doc.id, savedBy: account?.username });
      invalidate(s.workerId!);
    },
    onError: (e, s) => patch(s.id, { status: "error", error: e instanceof ApiError ? (e.issues[0]?.message ?? e.message) : "The server didn't respond." }),
  });

  const verify = useMutation({
    mutationFn: (s: Scan) => api.patch(`/api/documents/${s.docId}/verify`),
    onMutate: (s) => patch(s.id, { status: "verifying" }),
    onSuccess: (_, s) => {
      patch(s.id, { status: "verified" });
      invalidate(s.workerId!);
      toast.success(`${documentLabel(s.type)} verified`);
    },
    onError: (e, s) => patch(s.id, { status: "error", error: e instanceof ApiError ? e.message : "The server didn't respond." }),
  });

  const saveAll = async () => {
    const batch = scans.filter(ready);
    const results = await Promise.allSettled(batch.map((s) => save.mutateAsync(s)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    toast.success(`Saved ${ok} of ${batch.length} documents`, { description: ok < batch.length ? "Open the ones marked “Needs attention”." : "Each now waits for HR verification." });
  };

  const selected = scans.find((s) => s.id === selectedId) ?? null;
  const readyCount = scans.filter(ready).length;
  const worker = (id: string | null) => workforce.data?.find((w) => w.id === id);

  return (
    <Page>
      <PageHeader
        screen="S-08"
        title="Document upload"
        description="Drop a batch of scans, match each to a worker, enter its dates, then save and verify. Scans stay in this browser until file storage is connected."
        actions={
          scans.length > 0 && (
            <Button onClick={() => void saveAll()} disabled={readyCount === 0 || save.isPending}>
              <UploadIcon aria-hidden />
              Save {readyCount} ready
            </Button>
          )
        }
      />

      <label
        htmlFor="scan-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-card px-4 text-center transition-colors hover:bg-muted/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          scans.length ? "py-4" : "py-12",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <FileUpIcon aria-hidden className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">Drop scans here, or click to choose</span>
        <span className="text-xs text-muted-foreground">Passport, visa, labour card, medical, civil ID · JPG, PNG or PDF</span>
        <input id="scan-input" type="file" multiple accept="image/*,application/pdf" className="sr-only" aria-label="Choose scans" onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
      </label>

      {scans.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">The queue is empty. Name files like “visa-W-000123.jpg” and the type is picked for you.</p>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-3">
              <CardTitle className="text-sm">
                Queue <span className="font-normal text-muted-foreground tabular-nums">· {scans.length}</span>
              </CardTitle>
            </CardHeader>
            <ul aria-label="Scan queue" className="max-h-[32rem] divide-y overflow-y-auto">
              {scans.map((s) => {
                const w = worker(s.workerId);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(s.id)}
                      aria-current={s.id === selectedId || undefined}
                      className={cn("flex w-full items-center gap-3 px-3 py-2.5 text-start outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted", s.id === selectedId && "bg-primary/5")}
                    >
                      {s.kind === "image" ? (
                        <img src={s.url} alt="" className="size-10 shrink-0 rounded-md border object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted">
                          <FileTextIcon aria-hidden className="size-5 text-muted-foreground" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{w ? w.fullName : s.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {documentLabel(s.type)} · {w ? w.code : kb(s.size)}
                        </span>
                      </span>
                      <StatusBadge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</StatusBadge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {selected ? (
            <ScanEditor
              key={selected.id}
              scan={selected}
              workers={workforce.data}
              loadingWorkers={workforce.isPending}
              canVerify={canVerify}
              onChange={(c) => patch(selected.id, c)}
              onSave={() => save.mutate(selected)}
              onVerify={() => verify.mutate(selected)}
              onRemove={() => remove(selected)}
            />
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileTextIcon />
                </EmptyMedia>
                <EmptyTitle>Choose a scan</EmptyTitle>
                <EmptyDescription>Pick a file from the queue to match it to a worker and enter its dates.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      )}
    </Page>
  );
}

function ScanEditor({
  scan,
  workers,
  loadingWorkers,
  canVerify,
  onChange,
  onSave,
  onVerify,
  onRemove,
}: {
  scan: Scan;
  workers: ReturnType<typeof useWorkforce>["data"];
  loadingWorkers: boolean;
  canVerify: boolean;
  onChange: (c: Partial<Scan>) => void;
  onSave: () => void;
  onVerify: () => void;
  onRemove: () => void;
}) {
  const locked = scan.status !== "draft" && scan.status !== "error";
  const busy = scan.status === "saving" || scan.status === "verifying";
  const missing = !scan.workerId ? "Choose the worker first" : !scan.expiryDate ? "Enter the expiry date first" : null;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-h-64 items-center justify-center border-b bg-muted/40 p-4 md:border-e md:border-b-0">
          {scan.kind === "image" ? (
            <img src={scan.url} alt={`Scan: ${scan.name}`} className="max-h-[28rem] w-full rounded-md object-contain" />
          ) : (
            <object data={scan.url} type="application/pdf" aria-label={`Scan: ${scan.name}`} className="h-[28rem] w-full rounded-md border bg-card">
              <p className="p-4 text-sm text-muted-foreground">PDF preview isn't available in this browser.</p>
            </object>
          )}
        </div>
        <div className="flex flex-col gap-4 p-4">
          <CardHeader className="px-0">
            <CardTitle className="truncate text-base">{scan.name}</CardTitle>
            <CardDescription>Check the details against the scan before saving.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 px-0">
            <div className="grid gap-1.5">
              <Label htmlFor="scan-worker">Worker</Label>
              {locked ? (
                <p className="text-sm font-medium">{workers?.find((w) => w.id === scan.workerId)?.fullName}</p>
              ) : (
                <WorkerPicker id="scan-worker" workers={workers} loading={loadingWorkers} value={scan.workerId} onChange={(w) => onChange({ workerId: w.id })} />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="scan-type">Type</Label>
                <NativeSelect id="scan-type" value={scan.type} disabled={locked} onChange={(e) => onChange({ type: e.target.value as DocumentType })}>
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {documentLabel(t)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="scan-number">Number</Label>
                <Input id="scan-number" className="font-mono" value={scan.number} disabled={locked} onChange={(e) => onChange({ number: e.target.value })} autoComplete="off" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="scan-issued">Issued</Label>
                <Input id="scan-issued" type="date" value={scan.issueDate} disabled={locked} onChange={(e) => onChange({ issueDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="scan-expires">Expires</Label>
                <Input id="scan-expires" type="date" value={scan.expiryDate} disabled={locked} onChange={(e) => onChange({ expiryDate: e.target.value })} />
              </div>
            </div>
            {scan.status === "error" && scan.error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {scan.error}
              </p>
            )}
            {scan.savedBy && (
              <p className="text-xs text-muted-foreground">
                Saved by {userLabel(scan.savedBy)}. {scan.status === "verified" ? "Verified." : "Waiting for an HR check against the scan."}
              </p>
            )}
          </CardContent>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
            {!locked ? (
              missing ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Button disabled>Save document</Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{missing}</TooltipContent>
                </Tooltip>
              ) : (
                <Button onClick={onSave} disabled={busy}>
                  Save document
                </Button>
              )
            ) : scan.status === "verified" ? (
              <StatusBadge tone="ok">Verified</StatusBadge>
            ) : canVerify ? (
              <Button onClick={onVerify} disabled={busy}>
                {busy ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : <BadgeCheckIcon aria-hidden />}
                Verify
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button disabled>Verify</Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Only HR/PRO officers verify documents against the scan.</TooltipContent>
              </Tooltip>
            )}
            {scan.workerId && (scan.status === "saved" || scan.status === "verified") && (
              <Button variant="outline" asChild>
                <Link to={`/workers/${scan.workerId}`}>
                  Worker file
                  <ArrowUpRightIcon aria-hidden className="rtl:-scale-x-100" />
                </Link>
              </Button>
            )}
            <Button variant="ghost" className="ms-auto" onClick={onRemove} disabled={busy}>
              <Trash2Icon aria-hidden />
              Remove
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
