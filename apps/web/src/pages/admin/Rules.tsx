/**
 * S-37 Admin: rule tables (Backend Schema `rule_tables`, `rule_versions`; CLAUDE.md rule 3).
 * Legal and pay values live only in dated versions: no overlaps, and a version can't be used
 * until a named second person signs it. Seeded values are placeholders shown as
 * "demo · unsigned"; the savings-system start date is decision D9 and shows "Pending (D9)".
 * DEMO: src/demo/admin.ts until `/rules` exists.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FilePlus2Icon, PenLineIcon } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { displayDate } from "@/lib/format";
import { dates, todayOman } from "@/demo/core";
import { addRuleVersion, checkNewVersion, fetchRuleVersions, RULE_TABLES, signRuleVersion, versionState, type RuleTable, type RuleVersion, type VersionState } from "@/demo/admin";
import { displayMoment, personOf } from "@/demo/insight";
import { Page, PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STATE: Record<VersionState, { tone: StatusTone; text: string }> = {
  in_force: { tone: "ok", text: "In force" },
  scheduled: { tone: "info", text: "Scheduled" },
  superseded: { tone: "draft", text: "Superseded" },
  pending_decision: { tone: "incomplete", text: "Not in force" },
};
const KIND_LABEL: Record<RuleTable["kind"], string> = { legal: "Legal value", policy: "Company policy", tax: "Tax" };

function signature(v: RuleVersion): { tone: StatusTone; text: string } {
  if (v.pendingDecision) return { tone: "blocked", text: `Pending (${v.pendingDecision})` };
  if (v.signedBy) return { tone: "ok", text: "Signed" };
  if (v.demo) return { tone: "incomplete", text: "demo · unsigned" };
  return { tone: "due", text: "Awaiting sign-off" };
}

export function Rules() {
  const versions = useQuery({ queryKey: ["rule-versions"], queryFn: fetchRuleVersions });
  const [selected, setSelected] = useState(RULE_TABLES[0]!.key);
  const today = todayOman();
  const rule = RULE_TABLES.find((r) => r.key === selected)!;
  const all = versions.data ?? [];
  const mine = all.filter((v) => v.ruleKey === selected).sort((a, b) => b.version - a.version);
  const current = (key: string) => {
    const vs = all.filter((v) => v.ruleKey === key);
    return vs.find((v) => versionState(v, today) === "in_force") ?? vs.sort((a, b) => b.version - a.version)[0];
  };
  const unsigned = all.filter((v) => !v.signedBy).length;

  return (
    <Page>
      <PageHeader
        screen="S-37"
        title="Rule tables"
        sample
        description="Every legal and pay rule as dated versions. Pay, leave and billing use the version in force on the day, and only once a named person has signed it."
        meta={
          versions.data && (
            <>
              <StatusBadge tone="incomplete">{unsigned} versions unsigned</StatusBadge>
              <span className="text-xs text-muted-foreground">Demo values are placeholders, not legal advice. Labour lawyer sign-off is required before go-live.</span>
            </>
          )
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <Card className="gap-0 py-2">
          <nav aria-label="Rule tables">
            <ul className="space-y-0.5 px-2">
              {RULE_TABLES.map((r) => {
                const c = current(r.key);
                const sig = c ? signature(c) : null;
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      aria-current={r.key === selected ? "true" : undefined}
                      onClick={() => setSelected(r.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                        r.key === selected && "bg-primary/8 hover:bg-primary/10",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm text-pretty", r.key === selected && "font-medium text-primary")}>{r.name}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">{r.key}</span>
                      </span>
                      {versions.isPending ? <Skeleton className="h-5 w-16" /> : sig && <StatusBadge tone={sig.tone}>{sig.text}</StatusBadge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{rule.name}</CardTitle>
              <Badge variant="secondary">{KIND_LABEL[rule.kind]}</Badge>
            </div>
            <CardDescription className="space-y-1">
              <span className="block">{rule.description}</span>
              <span className="block font-mono text-xs">
                {rule.key} · owner: {ROLE_LABELS[rule.ownerRole]}
              </span>
            </CardDescription>
            <CardAction>
              <AddVersionDialog rule={rule} versions={all} latest={mine[0]} />
            </CardAction>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {versions.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <Table aria-label={`Versions of ${rule.key}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Valid from</TableHead>
                    <TableHead>Valid to</TableHead>
                    <TableHead>Parameters</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Sign-off</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mine.map((v) => {
                    const st = STATE[versionState(v, today)];
                    return (
                      <TableRow key={v.id} className="align-top">
                        <TableCell>
                          <div className="font-medium tabular-nums">v{v.version}</div>
                          <StatusBadge tone={st.tone} className="mt-1">
                            {st.text}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{v.validFrom ? displayDate(v.validFrom) : <StatusBadge tone="blocked">Pending (D9)</StatusBadge>}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{v.validTo ? displayDate(v.validTo) : <span className="text-muted-foreground">Open</span>}</TableCell>
                        <TableCell>
                          <pre className="max-w-72 overflow-x-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(v.params, null, 1).replace(/\n\s*/g, " ")}</pre>
                        </TableCell>
                        <TableCell className="max-w-56 text-xs text-muted-foreground whitespace-normal text-pretty">{v.sourceRef}</TableCell>
                        <TableCell className="whitespace-normal">
                          <SignOff v={v} rule={rule} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Page>
  );
}

function SignOff({ v, rule }: { v: RuleVersion; rule: RuleTable }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const sig = signature(v);
  const sign = useMutation({
    mutationFn: () => signRuleVersion(v.id, account?.username ?? ""),
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ["rule-versions"] });
      toast.success(`${x.ruleKey} v${x.version} signed`, { description: x.validFrom ? `Used for pay from ${displayDate(x.validFrom)}.` : undefined });
    },
    onError: (e) => toast.error("Not signed", { description: e instanceof Error ? e.message : String(e) }),
  });

  if (v.signedBy) {
    return (
      <div className="space-y-1">
        <StatusBadge tone="ok">Signed</StatusBadge>
        <div className="text-xs text-muted-foreground">
          {personOf(v.signedBy)}
          <br />
          {displayMoment(v.signedAt)}
        </div>
      </div>
    );
  }
  const own = v.createdBy === account?.username;
  const blockedReason = v.pendingDecision ? `Waiting on decision ${v.pendingDecision}: the start date is not set, so this version can't be signed.` : own ? "You created this version. A second person must sign it." : null;
  const button = (
    <Button size="xs" variant="outline" disabled={!!blockedReason || sign.isPending}>
      <PenLineIcon aria-hidden /> Sign off
    </Button>
  );
  return (
    <div className="space-y-1.5">
      <StatusBadge tone={sig.tone}>{sig.text}</StatusBadge>
      <div className="text-xs text-muted-foreground">Added by {personOf(v.createdBy)}</div>
      {blockedReason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-ring">
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{blockedReason}</TooltipContent>
        </Tooltip>
      ) : (
        <ConfirmDialog
          trigger={button}
          title={`Sign ${v.ruleKey} v${v.version}?`}
          description={
            <>
              <p>
                From {v.validFrom ? displayDate(v.validFrom) : "its start date"}, {rule.name.toLowerCase()} uses:
              </p>
              <pre className="rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap text-foreground">{JSON.stringify(v.params, null, 2)}</pre>
              <p>Source: {v.sourceRef}. Only sign values you have checked against the source.</p>
            </>
          }
          confirmLabel={`Sign v${v.version} as ${account?.displayName ?? "me"}`}
          onConfirm={() => sign.mutate()}
        />
      )}
    </div>
  );
}

function AddVersionDialog({ rule, versions, latest }: { rule: RuleTable; versions: RuleVersion[]; latest: RuleVersion | undefined }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [params, setParams] = useState("");
  const [source, setSource] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const blockedByDecision = latest?.pendingDecision;

  const reset = () => {
    setFrom(dates.addMonths(todayOman(), 1));
    setTo("");
    setParams(JSON.stringify(latest?.params ?? {}, null, 2));
    setSource("");
    setSubmitted(false);
  };

  const parsed = useMemo(() => {
    try {
      const p: unknown = JSON.parse(params);
      return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [params]);
  const check = from ? checkNewVersion(rule.key, from, to || null, versions) : null;
  const errors = {
    from: !from ? "Choose the first day this version applies." : check && "error" in check ? check.error : null,
    params: parsed ? null : "Parameters must be a JSON object, e.g. { \"multiplier\": \"1.25\" }.",
    source: source.trim().length < 4 ? "Name the source: the law article, decree or board minute." : null,
  };
  const valid = !errors.from && !errors.params && !errors.source;

  const add = useMutation({
    mutationFn: () => addRuleVersion({ ruleKey: rule.key, validFrom: from, validTo: to || null, params: parsed!, sourceRef: source.trim(), by: account?.username ?? "" }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["rule-versions"] });
      toast.success(`${v.ruleKey} v${v.version} saved, awaiting sign-off`, { description: "Nothing uses it until a second person signs it." });
      setOpen(false);
    },
    onError: (e) => toast.error("Version not saved", { description: e instanceof Error ? e.message : String(e) }),
  });

  const trigger = (
    <Button size="sm" disabled={!!blockedByDecision}>
      <FilePlus2Icon aria-hidden /> Add version
    </Button>
  );

  if (blockedByDecision) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
            {trigger}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">The start date is decision {blockedByDecision}. Record the answer in DECISIONS first.</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New version of {rule.key}</DialogTitle>
          <DialogDescription>Versions never overlap and are never edited. Pay already calculated keeps the version it used.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (valid) add.mutate();
          }}
        >
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={submitted && !!errors.from}>
                <FieldLabel htmlFor="rv-from">Valid from</FieldLabel>
                <Input id="rv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={!!errors.from && (submitted || !!from)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="rv-to">Valid to (optional)</FieldLabel>
                <Input id="rv-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            {errors.from && (submitted || from) ? (
              <FieldError>{errors.from}</FieldError>
            ) : check && "closes" in check && check.closes ? (
              <FieldDescription>
                v{check.closes.version} will end on {displayDate(dates.addDays(from, -1))}, the day before this version starts.
              </FieldDescription>
            ) : null}
            <Field data-invalid={submitted && !!errors.params}>
              <FieldLabel htmlFor="rv-params">Parameters (JSON)</FieldLabel>
              <Textarea id="rv-params" value={params} onChange={(e) => setParams(e.target.value)} rows={5} className="font-mono text-xs" aria-invalid={!parsed} spellCheck={false} />
              {!parsed ? <FieldError>{errors.params}</FieldError> : <FieldDescription>Started from v{latest?.version ?? 0}. Money and rates as strings.</FieldDescription>}
            </Field>
            <Field data-invalid={submitted && !!errors.source}>
              <FieldLabel htmlFor="rv-source">Source</FieldLabel>
              <Input id="rv-source" value={source} onChange={(e) => setSource(e.target.value)} aria-invalid={submitted && !!errors.source} placeholder="Law article, decree or board minute" />
              {submitted && errors.source && <FieldError>{errors.source}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={add.isPending}>
              Save for sign-off
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
