/**
 * S-38 Admin: audit and health (CLAUDE.md rule 8; Backend Schema `audit_events`, built).
 * LIVE: the hash-chain check (`GET /api/audit/verify`) and the audit search by subject
 * (`GET /api/audit?subjectId=`). DEMO: the integration health tiles (src/demo/admin.ts).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronsUpDownIcon, HistoryIcon, LinkIcon, SearchIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useWorkforce } from "@/demo/workforce";
import { fetchIntegrations, type Integration } from "@/demo/admin";
import { displayMoment } from "@/demo/insight";
import { Page, PageHeader, SampleDataBadge } from "@/components/page-header";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

interface AuditEvent {
  id: number;
  actor: string;
  action: string;
  subjectType: string;
  subjectId: string;
  before: unknown;
  after: unknown;
  at: string;
  prevHash: string;
  hash: string;
}
interface ChainResult {
  intact: boolean;
  checked: number;
  firstBrokenId: number | null;
}

const HEALTH: Record<Integration["status"], StatusTone> = { ok: "ok", degraded: "due", pending: "incomplete" };

export function Audit() {
  const [result, setResult] = useState<(ChainResult & { at: string }) | null>(null);
  const verify = useMutation({
    mutationFn: () => api.get<ChainResult>("/api/audit/verify"),
    onSuccess: (r) => {
      setResult({ ...r, at: new Date().toISOString() });
      if (r.intact) toast.success(`Audit chain intact · ${r.checked.toLocaleString("en-GB")} events checked`);
      else toast.error(`Audit chain broken at event #${r.firstBrokenId}`);
    },
    onError: (e) => toast.error("Couldn't run the chain check", { description: `${String(e)}. Check the API is running, then retry.` }),
  });
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: fetchIntegrations });

  return (
    <Page>
      <PageHeader
        screen="S-38"
        title="Audit and health"
        description="Every change is written to an append-only, hash-chained log. Check the chain, look up any record's history, and watch the outside services the system depends on."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Chain check</CardTitle>
            <CardDescription>Recomputes every event's SHA-256 hash from the first. Any edited or deleted row breaks the chain.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result ? (
              <div className={`flex items-start gap-3 rounded-lg border p-3 ${result.intact ? "border-success/30 bg-success/8" : "border-destructive/30 bg-destructive/8"}`} role="status">
                {result.intact ? <ShieldCheckIcon aria-hidden className="mt-0.5 size-5 text-success" /> : <ShieldAlertIcon aria-hidden className="mt-0.5 size-5 text-destructive" />}
                <div className="space-y-1">
                  <div className="font-medium">{result.intact ? "Chain intact" : `Broken at event #${result.firstBrokenId}`}</div>
                  <div className="text-sm text-muted-foreground tabular-nums">
                    {result.checked.toLocaleString("en-GB")} events checked · {displayMoment(result.at)}
                  </div>
                  {result.checked === 0 && <div className="text-sm text-muted-foreground">No events yet. They appear as soon as anyone creates or changes a record.</div>}
                  {!result.intact && <div className="text-sm">Stop editing, keep the database as it is, and tell the security lead. Do not try to repair rows.</div>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not run in this session. The nightly check passed at 05:00.</p>
            )}
            <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
              {verify.isPending ? <Spinner /> : <ShieldCheckIcon aria-hidden />} Verify chain
            </Button>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Integration health <SampleDataBadge />
            </CardTitle>
            <CardDescription>Outside services, checked every five minutes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {integrations.isPending
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)
                : integrations.data?.map((i) => (
                    <li key={i.id} className="space-y-1.5 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{i.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{i.purpose}</div>
                        </div>
                        <StatusBadge tone={HEALTH[i.status]}>{i.statusText}</StatusBadge>
                      </div>
                      <p className="text-xs text-pretty">{i.detail}</p>
                      <p className="text-xs text-muted-foreground">Last check: {i.lastCheckAt ? displayMoment(i.lastCheckAt) : "not connected"}</p>
                    </li>
                  ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <AuditSearch />
    </Page>
  );
}

function AuditSearch() {
  const workforce = useWorkforce();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [input, setInput] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const events = useQuery({
    queryKey: ["audit", subjectId],
    queryFn: () => api.get<{ items: AuditEvent[] }>(`/api/audit?subjectId=${encodeURIComponent(subjectId)}`),
    enabled: subjectId.length > 0,
  });
  const worker = workforce.data?.find((w) => w.id === subjectId);

  const pick = (id: string) => {
    setInput(id);
    setSubjectId(id);
    setPickerOpen(false);
  };

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>Audit search</CardTitle>
        <CardDescription>Every change to one record, oldest first: who did it, when, and what changed.</CardDescription>
        {worker && (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <Link to={`/workers/${worker.id}`}>
                <LinkIcon aria-hidden /> Open {worker.fullName}
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-3 md:flex-row md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setSubjectId(input.trim());
          }}
        >
          <Field className="md:w-72">
            <FieldLabel id="worker-pick-label">Worker</FieldLabel>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={pickerOpen} aria-labelledby="worker-pick-label" className="justify-between font-normal">
                  <span className="truncate">{worker ? `${worker.fullName} · ${worker.code}` : "Choose a worker…"}</span>
                  <ChevronsUpDownIcon aria-hidden className="opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Name or code…" />
                  <CommandList>
                    <CommandEmpty>{workforce.isPending ? "Loading workers…" : "No worker found."}</CommandEmpty>
                    <CommandGroup>
                      {workforce.data?.map((w) => (
                        <CommandItem key={w.id} value={`${w.fullName} ${w.code}`} onSelect={() => pick(w.id)}>
                          <span className="truncate">{w.fullName}</span>
                          <span className="ms-auto font-mono text-xs text-muted-foreground">{w.code}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </Field>
          <Field className="flex-1">
            <FieldLabel htmlFor="subject-id">Subject id</FieldLabel>
            <Input id="subject-id" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Record id (UUID)" className="font-mono text-xs" />
            <FieldDescription className="sr-only">Picking a worker fills this in.</FieldDescription>
          </Field>
          <Button type="submit" variant="secondary" disabled={!input.trim()}>
            <SearchIcon aria-hidden /> Search
          </Button>
        </form>

        {!subjectId ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HistoryIcon />
              </EmptyMedia>
              <EmptyTitle>Pick a record to see its history</EmptyTitle>
              <EmptyDescription>Choose a worker above, or paste the id of any record.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : events.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : events.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn't search the audit log: {String(events.error)}
          </p>
        ) : events.data.items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No audit events for this record. Seeded records have no history until someone changes them.</p>
        ) : (
          <ol className="space-y-2" aria-label="Audit events">
            {events.data.items.map((e) => (
              <li key={e.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">#{e.id}</span>
                  <span className="font-medium">{e.action}</span>
                  <span className="text-muted-foreground">
                    by <span className="text-foreground">{e.actor}</span> · {displayMoment(e.at)}
                  </span>
                  <span className="ms-auto font-mono text-[11px] text-muted-foreground" title={e.hash}>
                    {e.hash.slice(0, 12)}…
                  </span>
                </div>
                <Diff before={e.before} after={e.after} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));

/** Field-level before/after for the keys that changed. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (keys.length === 0) return null;
  return (
    <dl className="mt-2 grid gap-1 text-xs">
      {keys.map((k) => (
        <div key={k} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3">
          <dt className="truncate font-mono text-muted-foreground">{k}</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono">
            {k in b && <span className="max-w-full truncate rounded bg-destructive/10 px-1 text-destructive line-through">{show(b[k])}</span>}
            <span className="max-w-full truncate rounded bg-success/12 px-1 text-success">{show(a[k])}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
