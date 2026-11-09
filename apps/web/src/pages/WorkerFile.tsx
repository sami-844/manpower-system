/**
 * S-06 Worker file (full page on deep link; PRD 4.1 and 4.3). Real API: the worker and
 * documents (`GET /api/workers/:id`), document verify (`PATCH /api/documents/:id/verify`),
 * the eligibility check (`POST /api/compliance/check`, the one `checkEligibility()` engine) and
 * the audit trail (`GET /api/audit`). Assignments, Time and Pay are sample data until their
 * sprints (Assignments from `siteOf`, Pay from `basicWage`).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, DOCUMENT_TYPES, documentLabel, type DocumentType } from "@mms/core";
import {
  BadgeCheckIcon,
  BanIcon,
  CircleCheckIcon,
  FilePlusIcon,
  HistoryIcon,
  InfoIcon,
  LandmarkIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
  UploadIcon,
  UserRoundXIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, type EligibilityResult, type Site, type WorkerDetail } from "../lib/api";
import { describeExpiry, displayDate, displayDateTime, humaniseDates, maskTail, renewalTone, statusLabel, statusTone, userLabel } from "../lib/format";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { dates, hash, money, rng, todayOman } from "@/demo/core";
import { clientById, SITES } from "@/demo/reference";
import { basicWage, siteOf } from "@/demo/workforce";
import { FieldErrors } from "@/components/FieldErrors";
import { Money } from "@/components/money";
import { Page, PageHeader, SampleDataBadge } from "@/components/page-header";
import { ComplianceBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NativeSelect, WorkerStatusText } from "./workforce/shared";

type DocView = WorkerDetail["documents"][number] & { createdAt?: string; verifiedAt?: string | null };
interface AuditRow {
  id: number;
  actor: string;
  action: string;
  subjectId: string;
  before: unknown;
  after: Record<string, unknown> | null;
  at: string;
}

const HR_ROLES = ["hr_pro", "admin"];

export function WorkerFile() {
  const { id = "" } = useParams();
  const worker = useQuery({ queryKey: ["worker", id], queryFn: () => api.get<WorkerDetail>(`/api/workers/${id}`) });

  if (worker.isPending) {
    return (
      <Page>
        <div className="space-y-2" aria-busy="true" aria-label="Loading worker">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-5 w-96 max-w-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </Page>
    );
  }
  if (worker.isError) {
    const notFound = worker.error instanceof ApiError && worker.error.status === 404;
    return (
      <Page>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserRoundXIcon />
            </EmptyMedia>
            <EmptyTitle>{notFound ? "No worker with this ID" : "Couldn't load this worker"}</EmptyTitle>
            <EmptyDescription>{notFound ? "The link may be old, or the worker was entered under another code." : "Check the server is running, then reload."}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link to="/workers">Back to workers</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    );
  }

  return <WorkerFileBody w={worker.data} />;
}

function WorkerFileBody({ w }: { w: WorkerDetail }) {
  const [adding, setAdding] = useState(false);
  const docs = w.documents as DocView[];
  const docIds = docs.map((d) => d.id).join(",");
  const audit = useQuery({
    queryKey: ["audit", w.id, docIds],
    queryFn: async () => {
      const lists = await Promise.all([w.id, ...docs.map((d) => d.id)].map((s) => api.get<{ items?: AuditRow[] }>(`/api/audit?subjectId=${s}`)));
      return lists.flatMap((l) => (Array.isArray(l?.items) ? l.items : []));
    },
  });
  // Who added each document (maker), so the checker can be shown beside them.
  const addedBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of audit.data ?? []) if (e.action === "document.create") m.set(e.subjectId, e.actor);
    return m;
  }, [audit.data]);

  return (
    <Page>
      <PageHeader
        screen="S-06"
        title={w.fullName}
        meta={
          <>
            <span className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-xs">{w.code}</span>
            <WorkerStatusText status={w.status} />
            <ComplianceBadge state={w.compliance.state} daysLeft={w.compliance.nextExpiry?.daysLeft} />
            <span className="text-sm text-muted-foreground">
              {w.trade} · {w.nationality}
            </span>
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/overrides?worker=${w.id}`}>
                <ShieldAlertIcon aria-hidden />
                Request override
              </Link>
            </Button>
            <Button onClick={() => setAdding(true)}>
              <FilePlusIcon aria-hidden />
              Add document
            </Button>
          </>
        }
      />
      <AddDocumentDialog workerId={w.id} open={adding} onOpenChange={setAdding} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Tabs defaultValue="overview" className="min-w-0 gap-4">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
              <TabsTrigger value="time">Time</TabsTrigger>
              <TabsTrigger value="pay">Pay</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="overview" className="space-y-6">
            <DocumentsCard worker={w} addedBy={addedBy} onAdd={() => setAdding(true)} />
            <ProfileCard w={w} />
          </TabsContent>
          <TabsContent value="documents">
            <VerificationTrail docs={docs} addedBy={addedBy} />
          </TabsContent>
          <TabsContent value="assignments">
            <AssignmentsTab w={w} />
          </TabsContent>
          <TabsContent value="time">
            <TimeTab w={w} />
          </TabsContent>
          <TabsContent value="pay">
            <PayTab w={w} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab w={w} events={audit.data} loading={audit.isPending} />
          </TabsContent>
        </Tabs>
        <EligibilityCheck workerId={w.id} />
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Documents (real)
// ---------------------------------------------------------------------------

function DocStatus({ d }: { d: DocView }) {
  return d.renewal ? (
    <StatusBadge tone={statusTone(renewalTone(d.renewal.state, d.renewal.daysLeft))}>{d.renewal.state === "ok" ? "Valid" : describeExpiry(d.renewal.daysLeft)}</StatusBadge>
  ) : (
    <StatusBadge tone="incomplete">No expiry date</StatusBadge>
  );
}

function DocumentsCard({ worker, addedBy, onAdd }: { worker: WorkerDetail; addedBy: Map<string, string>; onAdd: () => void }) {
  const qc = useQueryClient();
  const { account } = useSession();
  const canVerify = !!account && HR_ROLES.includes(account.role);
  const verify = useMutation({
    mutationFn: (doc: DocView) => api.patch<DocView>(`/api/documents/${doc.id}/verify`),
    onSuccess: (_, doc) => {
      toast.success(`${documentLabel(doc.type)} verified`, { description: "Recorded in the audit trail with your name." });
      void qc.invalidateQueries({ queryKey: ["worker", worker.id] });
      void qc.invalidateQueries({ queryKey: ["workers"] });
      void qc.invalidateQueries({ queryKey: ["audit", worker.id] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Couldn't verify. Try again."),
  });
  const docs = worker.documents as DocView[];
  const missing = worker.compliance.missing;

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b py-3">
        <div>
          <CardTitle className="text-base">Documents</CardTitle>
          <CardDescription>Numbers are masked to the last four. Each check by HR is recorded with a name.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {docs.length === 0 ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle>No documents yet</EmptyTitle>
              <EmptyDescription>Add the passport, residence visa, labour card and medical. The worker can't be deployed until all four are valid.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" asChild>
                <Link to="/documents/upload">
                  <UploadIcon aria-hidden />
                  Upload scans
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <Table aria-label="Documents">
              <TableHeader className="bg-muted/50 [&_th]:h-9 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4">Document</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pe-4">Checked by HR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id} className="h-11">
                    <th scope="row" className="ps-4 text-start text-sm font-medium">
                      {documentLabel(d.type)}
                    </th>
                    <TableCell className="font-mono text-xs tabular-nums">{d.number ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{displayDate(d.expiryDate)}</TableCell>
                    <TableCell>
                      <DocStatus d={d} />
                    </TableCell>
                    <TableCell className="pe-4">
                      {d.verified ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <BadgeCheckIcon aria-hidden className="size-4 text-success" />
                          {d.verifiedBy ? userLabel(d.verifiedBy) : "At data import"}
                        </span>
                      ) : canVerify ? (
                        <Button size="xs" variant="outline" aria-label={`Verify ${documentLabel(d.type)}`} disabled={verify.isPending} onClick={() => verify.mutate(d)}>
                          Verify
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0} className="text-sm text-muted-foreground underline decoration-dotted underline-offset-4">
                              Awaiting HR
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Only HR/PRO officers verify documents against the scan.</TooltipContent>
                        </Tooltip>
                      )}
                      {addedBy.get(d.id) && <span className="block text-xs text-muted-foreground">Added by {userLabel(addedBy.get(d.id))}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {missing.length > 0 && docs.length > 0 && (
          <div className="flex items-start gap-2 border-t px-4 py-3 text-sm">
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>
              Still needed: <span className="font-medium">{missing.map(documentLabel).join(", ")}</span>.{" "}
              <button type="button" onClick={onAdd} className="text-primary underline-offset-4 hover:underline">
                Add one now
              </button>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VerificationTrail({ docs, addedBy }: { docs: DocView[]; addedBy: Map<string, string> }) {
  if (docs.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No documents yet. Once papers are added, this shows who entered each one and who checked it.</p>;
  }
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-3">
        <CardTitle className="text-base">Verification trail</CardTitle>
        <CardDescription>Maker and checker for every paper. The person who adds a scan and the person who checks it should differ.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table aria-label="Verification trail">
          <TableHeader className="bg-muted/50 [&_th]:h-9 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-4">Document</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead className="pe-4">Checked by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => {
              const maker = addedBy.get(d.id);
              const same = maker && d.verifiedBy && maker === d.verifiedBy;
              return (
                <TableRow key={d.id} className="h-11">
                  <TableCell className="ps-4 font-medium">{documentLabel(d.type)}</TableCell>
                  <TableCell className="tabular-nums">{displayDate(d.issueDate)}</TableCell>
                  <TableCell className="tabular-nums">{displayDate(d.expiryDate)}</TableCell>
                  <TableCell>
                    {maker ? userLabel(maker) : <span className="text-muted-foreground">Data import</span>}
                    {d.createdAt && <span className="block text-xs text-muted-foreground">{displayDateTime(d.createdAt)}</span>}
                  </TableCell>
                  <TableCell className="pe-4">
                    {d.verified ? (
                      <>
                        <span className="inline-flex items-center gap-1.5">
                          {d.verifiedBy ? userLabel(d.verifiedBy) : "At data import"}
                          {same && <StatusBadge tone="due">Same person</StatusBadge>}
                        </span>
                        {d.verifiedAt && <span className="block text-xs text-muted-foreground">{displayDateTime(d.verifiedAt)}</span>}
                      </>
                    ) : (
                      <StatusBadge tone="incomplete">Not checked</StatusBadge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddDocumentDialog({ workerId, open, onOpenChange }: { workerId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<DocView>(`/api/workers/${workerId}/documents`, body),
    onSuccess: (doc) => {
      onOpenChange(false);
      toast.success(`${documentLabel(doc.type)} added`, { description: "It shows as not checked until HR verifies it against the scan." });
      void qc.invalidateQueries({ queryKey: ["worker", workerId] });
      void qc.invalidateQueries({ queryKey: ["workers"] });
      void qc.invalidateQueries({ queryKey: ["renewals"] });
      void qc.invalidateQueries({ queryKey: ["audit", workerId] });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) add.reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
          <DialogDescription>Enter the details exactly as printed. The number is stored in full but shown masked.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            add.mutate({
              type: f.get("type"),
              number: f.get("number") || undefined,
              issueDate: f.get("issueDate") || undefined,
              expiryDate: f.get("expiryDate") || null,
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="doc-type">Type</Label>
            <NativeSelect id="doc-type" name="type" required defaultValue="passport">
              {DOCUMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {documentLabel(t)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doc-number">Number</Label>
            <Input id="doc-number" name="number" autoComplete="off" className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="doc-issued">Issued</Label>
              <Input id="doc-issued" name="issueDate" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="doc-expires">Expires</Label>
              <Input id="doc-expires" name="expiryDate" type="date" />
            </div>
          </div>
          <FieldErrors error={add.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              Save document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Eligibility (real engine)
// ---------------------------------------------------------------------------

function EligibilityCheck({ workerId }: { workerId: string }) {
  const today = todayOman();
  const { account } = useSession();
  const sites = useQuery({ queryKey: ["sites"], queryFn: () => api.get<{ items: Site[] }>("/api/sites") });
  const check = useMutation({
    mutationFn: (body: { workerId: string; siteId?: string; from: string; to: string }) => api.post<EligibilityResult>("/api/compliance/check", body),
  });

  return (
    <Card className="gap-4 lg:sticky lg:top-20" aria-labelledby="check-h">
      <CardHeader>
        <CardTitle id="check-h" className="text-base">
          Can this worker work these dates?
        </CardTitle>
        <CardDescription>Runs the compliance engine: every paper against the period, plus any papers the site requires.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const siteId = String(f.get("siteId") ?? "");
            check.mutate({ workerId, ...(siteId ? { siteId } : {}), from: String(f.get("from")), to: String(f.get("to")) });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="elig-site">Site</Label>
            <NativeSelect id="elig-site" name="siteId" defaultValue="">
              <option value="">Any site</option>
              {sites.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="elig-from">From</Label>
              <Input id="elig-from" name="from" type="date" required defaultValue={today} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="elig-to">To</Label>
              <Input id="elig-to" name="to" type="date" required defaultValue={addDays(today, 30)} />
            </div>
          </div>
          <Button type="submit" disabled={check.isPending}>
            Check eligibility
          </Button>
        </form>
        <FieldErrors error={check.error} />
        {check.data && <EligibilityResultView result={check.data} workerId={workerId} isOps={account?.role === "ops_manager"} />}
      </CardContent>
    </Card>
  );
}

function EligibilityResultView({ result, workerId, isOps }: { result: EligibilityResult; workerId: string; isOps: boolean }) {
  const overridable = result.blockers.find((b) => b.code !== "WORKER_NOT_ACTIVE");
  return (
    <div role="status" className={cn("space-y-3 rounded-lg border p-3", result.eligible ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5")}>
      <div className="flex items-center gap-2">
        {result.eligible ? <CircleCheckIcon aria-hidden className="size-5 text-success" /> : <BanIcon aria-hidden className="size-5 text-destructive" />}
        <span className={cn("font-semibold", result.eligible ? "text-success" : "text-destructive")}>{result.eligible ? "Can be deployed" : "Cannot be deployed"}</span>
      </div>
      {result.blockers.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {result.blockers.map((b, i) => (
            <li key={`${b.code}-${b.documentType ?? i}`} className="flex gap-2">
              <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>{humaniseDates(b.message)}</span>
            </li>
          ))}
        </ul>
      )}
      {result.warnings.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase">Also note</h3>
          <ul className="space-y-1.5 text-sm">
            {result.warnings.map((w, i) => (
              <li key={`${w.code}-${w.documentType ?? i}`} className="flex gap-2">
                <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>{humaniseDates(w.message)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {overridable && (
        <div className="border-t pt-3 text-sm">
          <p className="text-muted-foreground">Fix the paper first. For an urgent case the operations manager can approve a dated override.</p>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link to={`/overrides?worker=${workerId}&code=${overridable.code}${overridable.documentType ? `&doc=${overridable.documentType}` : ""}`}>
              <ShieldAlertIcon aria-hidden />
              {isOps ? "Approve an override" : "Request an override"}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview profile
// ---------------------------------------------------------------------------

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function ProfileCard({ w }: { w: WorkerDetail & { dateOfBirth?: string | null; fullNameAr?: string | null } }) {
  const site = siteOf(w);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Fact label="Worker code">
            <span className="font-mono">{w.code}</span>
          </Fact>
          <Fact label="Trade">{w.trade}</Fact>
          <Fact label="Nationality">{w.nationality}</Fact>
          <Fact label="Status">{statusLabel(w.status)}</Fact>
          <Fact label="Phone">{w.phone ?? "—"}</Fact>
          <Fact label="Joined">{displayDate(w.joinedOn)}</Fact>
          <Fact label="Date of birth">{displayDate(w.dateOfBirth)}</Fact>
          <Fact label="Name in Arabic">{w.fullNameAr ? <span dir="rtl">{w.fullNameAr}</span> : "—"}</Fact>
          <Fact label="Current site">{site ? `${site.name}` : "Not on a site"}</Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Assignments, Time, Pay (sample data until their sprints)
// ---------------------------------------------------------------------------

function SampleNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <SampleDataBadge />
      <span>{children}</span>
    </div>
  );
}

function assignmentHistory(w: WorkerDetail) {
  const r = rng(`assign:${w.code}`);
  const today = todayOman();
  const current = siteOf(w);
  const rows: { site: (typeof SITES)[number]; from: string; to: string | null }[] = [];
  let end = current ? dates.addDays(today, -r.int(20, 160)) : dates.addDays(today, -r.int(5, 40));
  if (current) rows.push({ site: current, from: end, to: null });
  const start = w.joinedOn ?? dates.addDays(today, -700);
  for (let i = 0; i < 3; i++) {
    const to = dates.addDays(end, -r.int(1, 6));
    const from = dates.addDays(to, -r.int(45, 220));
    if (from < start) break;
    rows.push({ site: r.pick(SITES.slice(0, 6)), from, to });
    end = from;
  }
  return rows;
}

function AssignmentsTab({ w }: { w: WorkerDetail }) {
  const rows = useMemo(() => assignmentHistory(w), [w]);
  return (
    <div className="space-y-3">
      <SampleNote>Assignments come from the roster (S-17) in its sprint.</SampleNote>
      <Card className="gap-0 py-0">
        <CardContent className="overflow-x-auto px-0">
          <Table aria-label="Assignment history">
            <TableHeader className="bg-muted/50 [&_th]:h-9 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-4">Site</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="pe-4">To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No assignments yet. The worker appears here once rostered to a site.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((a) => (
                  <TableRow key={`${a.site.code}-${a.from}`} className="h-11">
                    <TableCell className="ps-4">
                      <span className="font-medium">{a.site.name}</span>
                      <span className="ms-2 font-mono text-xs text-muted-foreground">{a.site.code}</span>
                    </TableCell>
                    <TableCell>{clientById(a.site.clientId)?.legalName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{displayDate(a.from)}</TableCell>
                    <TableCell className="pe-4 tabular-nums">{a.to ? displayDate(a.to) : <StatusBadge tone="info">Current</StatusBadge>}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TimeTab({ w }: { w: WorkerDetail }) {
  const weeks = useMemo(() => {
    if (w.status !== "deployed") return [];
    const r = rng(`time:${w.code}`);
    const today = todayOman();
    // Weeks start on Sunday (Oman's working week; Friday and Saturday are the weekend).
    const sunday = dates.addDays(today, -dates.weekday(today));
    return Array.from({ length: 4 }, (_, i) => {
      const from = dates.addDays(sunday, -7 * (i + 1));
      const absent = r.chance(0.2) ? 1 : 0;
      const days = 5 - absent + (r.chance(0.3) ? 1 : 0);
      return { from, to: dates.addDays(from, 6), days, normal: days * 8, overtime: r.int(0, 9), absent };
    });
  }, [w]);
  return (
    <div className="space-y-3">
      <SampleNote>Hours as entered from the printed daily sheets (S-40).</SampleNote>
      {weeks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No time recorded in the last four weeks. Time appears here once the worker is on a site's daily sheet.</p>
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="overflow-x-auto px-0">
            <Table aria-label="Recent time">
              <TableHeader className="bg-muted/50 [&_th]:h-9 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4">Week</TableHead>
                  <TableHead className="text-end">Days</TableHead>
                  <TableHead className="text-end">Normal hours</TableHead>
                  <TableHead className="text-end">Overtime hours</TableHead>
                  <TableHead className="pe-4 text-end">Absent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {weeks.map((wk) => (
                  <TableRow key={wk.from} className="h-10 tabular-nums">
                    <TableCell className="ps-4">
                      {displayDate(wk.from)} – {displayDate(wk.to)}
                    </TableCell>
                    <TableCell className="text-end">{wk.days}</TableCell>
                    <TableCell className="text-end">{wk.normal}</TableCell>
                    <TableCell className="text-end">{wk.overtime}</TableCell>
                    <TableCell className="pe-4 text-end">{wk.absent ? <StatusBadge tone="due">{wk.absent} day</StatusBadge> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PayTab({ w }: { w: WorkerDetail }) {
  const basic = basicWage(w);
  const allowance = "20.000";
  const account = String(1000 + (hash(`bank:${w.code}`) % 9000));
  const slips = useMemo(() => {
    const r = rng(`pay:${w.code}`);
    const today = todayOman();
    return [1, 2, 3].map((n) => {
      const month = dates.addMonths(today, -n);
      const overtime = money.between(r, "0.000", "45.000", "0.250");
      const gross = money.sum([basic, allowance, overtime]);
      const deductions = r.chance(0.3) ? money.between(r, "5.000", "25.000", "1.000") : "0.000";
      return { month, gross, deductions, net: money.minus(gross, deductions) };
    });
  }, [w.code, basic]);
  return (
    <div className="space-y-3">
      <SampleNote>Pay figures arrive with the payroll engine (S-22).</SampleNote>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">Wage</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Basic wage (monthly)</dt>
                <dd className="font-medium">
                  <Money value={basic} />
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Food allowance</dt>
                <dd className="font-medium">
                  <Money value={allowance} />
                </dd>
              </div>
            </dl>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="mt-2 inline-block">
                  <Button size="sm" variant="outline" disabled>
                    Change wage
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Wage changes need a second approver (four eyes). They are raised from Payroll.</TooltipContent>
            </Tooltip>
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="text-base">Salary account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Bank</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium">
                  <LandmarkIcon aria-hidden className="size-3.5 text-muted-foreground" />
                  Bank Muscat
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted-foreground">Account</dt>
                <dd className="font-mono font-medium">{maskTail(`00000000${account}`)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Paid through</dt>
                <dd className="text-end font-medium">
                  WPS <span className="block text-xs font-normal text-muted-foreground">File format pending decision D8</span>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="overflow-x-auto px-0">
          <Table aria-label="Recent payslips">
            <TableHeader className="bg-muted/50 [&_th]:h-9 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead className="ps-4">Period</TableHead>
                <TableHead className="text-end">Gross</TableHead>
                <TableHead className="text-end">Deductions</TableHead>
                <TableHead className="pe-4 text-end">Net paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slips.map((s) => (
                <TableRow key={s.month} className="h-10">
                  <TableCell className="ps-4">{dates.monthName(s.month)}</TableCell>
                  <TableCell>
                    <Money value={s.gross} />
                  </TableCell>
                  <TableCell>
                    <Money value={s.deductions} />
                  </TableCell>
                  <TableCell className="pe-4 font-medium">
                    <Money value={s.net} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History (real audit events + the record's own dates)
// ---------------------------------------------------------------------------

interface HistoryItem {
  key: string;
  at: string;
  title: string;
  detail?: string;
  actor?: string;
  tone: "default" | "ok" | "warn";
}

const docName = (v: unknown) => (DOCUMENT_TYPES as readonly string[]).includes(String(v)) ? documentLabel(v as DocumentType) : "Document";

function historyFor(w: WorkerDetail & { createdAt?: string }, events: AuditRow[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  const audited = new Set(events.filter((e) => e.action === "document.create").map((e) => e.subjectId));
  for (const e of events) {
    const a = e.after ?? {};
    const base = { key: `a${e.id}`, at: e.at, actor: e.actor };
    if (e.action === "worker.create") items.push({ ...base, title: "Worker created", detail: `${w.code} · ${w.trade}`, tone: "default" });
    else if (e.action === "document.create")
      items.push({ ...base, title: `${docName(a.type)} added`, detail: `${maskTail(a.number as string | null)} · expires ${displayDate(a.expiryDate as string | null)}`, tone: "default" });
    else if (e.action === "document.verify") items.push({ ...base, title: `${docName(a.type)} verified`, detail: "Checked against the scan", tone: "ok" });
    else if (e.action === "compliance.override")
      items.push({ ...base, title: "Override approved", detail: `${String(a.code ?? "").replaceAll("_", " ").toLowerCase()} until ${displayDate(a.validUntil as string)} · “${String(a.reason ?? "")}”`, tone: "warn" });
    else if (e.action === "leave.create") items.push({ ...base, title: "Leave recorded", detail: `${displayDate(a.fromDate as string)} – ${displayDate(a.toDate as string)}`, tone: "default" });
    else items.push({ ...base, title: e.action, tone: "default" });
  }
  // Records from the data import have no audit rows; show them from their own dates.
  for (const d of w.documents as DocView[]) {
    if (!audited.has(d.id) && d.createdAt) items.push({ key: `d${d.id}`, at: d.createdAt, title: `${documentLabel(d.type)} recorded`, detail: `From the data import · expires ${displayDate(d.expiryDate)}`, tone: "default" });
  }
  if (!events.some((e) => e.action === "worker.create") && w.createdAt) items.push({ key: "created", at: w.createdAt, title: "Worker record imported", detail: "From the company's previous records", tone: "default" });
  items.sort((x, y) => (x.at < y.at ? 1 : -1));
  if (w.joinedOn) items.push({ key: "joined", at: `${w.joinedOn}T00:00:00+04:00`, title: "Joined the company", detail: displayDate(w.joinedOn), tone: "default" });
  return items;
}

function HistoryTab({ w, events, loading }: { w: WorkerDetail; events: AuditRow[] | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }
  const items = historyFor(w, events ?? []);
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HistoryIcon aria-hidden className="size-4 text-muted-foreground" />
          History
        </CardTitle>
        <CardDescription>Every change to this worker and their papers, newest first, from the tamper-evident audit trail.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative ms-2 border-s">
          {items.map((it) => (
            <li key={it.key} className="relative ps-6 pb-5 last:pb-0">
              <span
                aria-hidden
                className={cn(
                  "absolute -start-[5px] top-1.5 size-2.5 rounded-full border-2 border-card ring-1",
                  it.tone === "ok" ? "bg-success ring-success/40" : it.tone === "warn" ? "bg-warning ring-warning/40" : "bg-primary ring-primary/30",
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="text-sm font-medium">{it.title}</p>
                <time className="text-xs text-muted-foreground tabular-nums">{it.key === "joined" ? displayDate(w.joinedOn) : displayDateTime(it.at)}</time>
              </div>
              {it.detail && <p className="text-sm text-muted-foreground">{it.detail}</p>}
              {it.actor && <p className="text-xs text-muted-foreground">by {userLabel(it.actor)}</p>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export type { DocumentType };
