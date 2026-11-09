/**
 * S-32 Owner dashboard (PRD §1 non-negotiable 5, §4.16; Design Brief "Dashboards" and "Owner
 * phone view"): one scrolling page on a phone, a cards grid on desktop. Four money cards, four
 * people/compliance cards, two charts, then needs-attention lists that link straight to the fix.
 *
 * LIVE: headcount, deployment/bench, expiring in 30 days, deployed with expired papers.
 * DEMO (src/demo/insight.ts): revenue, margin, cash, payroll, credit, approvals.
 */
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { documentLabel, formatOmr, omr } from "@mms/core";
import { ArrowRightIcon, CheckCheckIcon, ChevronRightIcon, TrendingUpIcon } from "lucide-react";
import { api, type DashboardSummary } from "@/lib/api";
import { describeExpiry } from "@/lib/format";
import { useWorkforce } from "@/demo/workforce";
import { APPROVAL_KIND_LABELS, CLIENT_MARGINS, CREDIT_WATCH, fetchApprovals, fetchOwnerFinance, MONTHLY, PERIOD_LABEL, pct } from "@/demo/insight";
import { NumberTicker } from "@/components/aceternity/number-ticker";
import { Page, PageHeader, SampleDataBadge } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { formatMoney } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

// Charts plot numbers; every figure a person reads (tooltips, labels) is the exact decimal string.
const toNum = (s: string) => Number(s); // display-only conversion for chart geometry, never arithmetic on money

const MONEY_FMT = (n: number) => Math.round(n).toLocaleString("en-GB");
const PCT_FMT = (n: number) => `${n.toFixed(1)}%`;

/** "OMR" small and quiet, the amount large: keeps three-decimal amounts readable in a phone card. */
function MoneyTicker({ value }: { value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-sm font-medium text-muted-foreground">OMR</span>
      <NumberTicker value={toNum(value)} format={MONEY_FMT} finalText={formatMoney(value, { bare: true })} />
    </span>
  );
}

const trendConfig = {
  revenue: { label: "Revenue", color: "var(--chart-1)" },
  payrollCost: { label: "Payroll cost", color: "var(--chart-2)" },
} satisfies ChartConfig;
const marginConfig = { marginPct: { label: "Gross margin", color: "var(--chart-1)" } } satisfies ChartConfig;

const trendData = MONTHLY.map((m) => ({ label: m.label, revenue: toNum(m.revenue), payrollCost: toNum(m.payrollCost), text: { revenue: m.revenue, payrollCost: m.payrollCost } }));
const marginData = CLIENT_MARGINS.map((c) => ({ ...c, short: c.name.replace(/ (LLC|Co\.|Services|Contracting|Fabrication|Works)$/, ""), marginPctN: toNum(c.marginPct) })).sort(
  (a, b) => b.marginPctN - a.marginPctN,
);
const lowest = marginData[marginData.length - 1]!;

export function OwnerDashboard() {
  const navigate = useNavigate();
  const still = useReducedMotion() ?? false;
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api.get<DashboardSummary>("/api/dashboard/summary") });
  const finance = useQuery({ queryKey: ["owner-finance"], queryFn: fetchOwnerFinance });
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: fetchApprovals });
  const workforce = useWorkforce();

  const s = summary.data;
  const f = finance.data;
  const pending = approvals.data?.pending ?? [];
  const deployedExpired = workforce.data?.filter((w) => w.status === "deployed" && w.compliance.state === "expired") ?? [];
  const deployed = s?.byStatus.deployed ?? 0;
  const available = s?.byStatus.available ?? 0;
  const deployRate = s && s.headcount ? (deployed / s.headcount) * 100 : 0;
  const benchRate = s && s.headcount ? (available / s.headcount) * 100 : 0;
  const loading = <Skeleton className="h-8 w-28" />;

  return (
    <Page>
      <PageHeader
        screen="S-32"
        title="Owner dashboard"
        sample
        description="The business on one screen. Tap any number to see the names or invoices behind it."
      />

      {pending.length > 0 && (
        <Link
          to="/approvals"
          className="group flex items-center gap-3 rounded-xl border border-highlight/40 bg-highlight/10 p-3 transition-colors hover:bg-highlight/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-highlight/20 text-highlight-foreground dark:text-highlight">
            <CheckCheckIcon aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{pending.length} approvals wait for you</span>
            <span className="block truncate text-sm text-muted-foreground">New contract · rate card · wage change · override · write-off</span>
          </span>
          <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
        </Link>
      )}

      <section aria-labelledby="money-h" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="money-h" className="text-sm font-medium text-muted-foreground">
            Money · {PERIOD_LABEL}
          </h2>
          <SampleDataBadge />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Revenue"
            to="/invoices"
            value={f ? <MoneyTicker value={f.revenue} /> : loading}
            footer={
              f ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <TrendingUpIcon aria-hidden className="size-4" />
                  {pct(omr(f.revenue).minus(omr(f.revenuePrev)).toFixed(3), f.revenuePrev)}% on September
                </span>
              ) : (
                "—"
              )
            }
            hint={`Invoiced from locked hours. September: ${formatMoney(f?.revenuePrev ?? MONTHLY[4]!.revenue)}`}
          />
          <KpiCard
            label="Gross margin"
            to="/clients"
            value={f ? <MoneyTicker value={f.grossMargin} /> : loading}
            footer={f ? `${pct(f.grossMargin, f.revenue)}% of revenue` : "—"}
            hint={`Lowest: ${lowest.name} at ${lowest.marginPct}%`}
          />
          <KpiCard
            label="Cash collected this month"
            to="/receivables"
            value={f ? <MoneyTicker value={f.cash.collected} /> : loading}
            footer={f ? `${pct(f.cash.collected, f.cash.dueThisMonth)}% of ${formatMoney(f.cash.dueThisMonth)} due` : "—"}
            hint={
              f ? (
                <div className="space-y-2">
                  <Progress value={toNum(pct(f.cash.collected, f.cash.dueThisMonth))} aria-label="Share of this month's receivables collected" className="h-1.5" />
                  <span>
                    {formatMoney(f.cash.overdue)} overdue on {f.cash.overdueInvoices} invoices
                  </span>
                </div>
              ) : undefined
            }
          />
          <KpiCard
            label={`Payroll due · ${f?.payroll.period ?? ""}`}
            to="/approvals"
            value={f ? <MoneyTicker value={f.payroll.net} /> : loading}
            footer={
              <span className="inline-flex items-center gap-2">
                <StatusBadge tone="ok">Funded</StatusBadge>
                <span>{f?.payroll.payslips ?? "—"} payslips</span>
              </span>
            }
            hint={f ? `Estimate. Salary account holds ${formatMoney(f.payroll.salaryAccountBalance)}; due through WPS by 3 Dec.` : undefined}
          />
        </div>
      </section>

      <section aria-labelledby="people-h" className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 id="people-h" className="text-sm font-medium text-muted-foreground">
            People and compliance · today
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            Live
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            label="Headcount"
            to="/workers"
            value={s ? <NumberTicker value={s.headcount} /> : loading}
            footer={s ? `${deployed} deployed` : "—"}
            hint={s ? `${available} on the bench, ${s.byStatus.on_leave ?? 0} on leave` : undefined}
          />
          <KpiCard
            label="Deployment rate"
            to="/bench"
            value={s ? <NumberTicker value={deployRate} format={PCT_FMT} /> : loading}
            footer={s ? `Bench rate ${PCT_FMT(benchRate)}` : "—"}
            hint={s ? `${available} workers available` : undefined}
          />
          <KpiCard
            label="Expiring in 30 days"
            to="/renewals"
            value={s ? <NumberTicker value={s.expiringIn30Days} /> : loading}
            footer="Documents to renew"
            hint={s ? `${s.byCompliance.expired} workers already expired` : undefined}
          />
          <KpiCard
            label="Blocks active"
            to="/workers?compliance=expired"
            value={workforce.data ? <NumberTicker value={deployedExpired.length} /> : loading}
            footer="On site, expired"
            hint="Deployed with lapsed papers; pay and rosters blocked"
          />
        </div>
      </section>

      <section aria-label="Trends" className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue and payroll cost</CardTitle>
            <CardDescription>Last six months. The summer dip is the midday work ban.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ChartContainer
              config={trendConfig}
              className="aspect-auto h-[240px] w-full"
              role="img"
              aria-label={`Revenue rose from ${formatOmr(omr(MONTHLY[0]!.revenue))} in May to ${formatOmr(omr(MONTHLY[5]!.revenue))} in October; payroll cost from ${formatOmr(omr(MONTHLY[0]!.payrollCost))} to ${formatOmr(omr(MONTHLY[5]!.payrollCost))}.`}
            >
              <AreaChart data={trendData} margin={{ left: 4, right: 12, top: 8 }} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} domain={[0, "auto"]} />
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltipContent
                      indicator="dot"
                      labelFormatter={(_, p) => `${(p?.[0]?.payload as { label?: string } | undefined)?.label ?? ""} 2026`}
                      formatter={(_, name, item) => {
                        const row = item.payload as (typeof trendData)[number];
                        const key = name === "revenue" ? "revenue" : "payrollCost";
                        return (
                          <div className="flex w-full items-center gap-2">
                            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--color-${key})` }} />
                            <span className="text-muted-foreground">{trendConfig[key].label}</span>
                            <span className="ms-auto font-mono font-medium tabular-nums">{formatMoney(row.text[key])}</span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Area dataKey="revenue" type="monotone" isAnimationActive={!still} fill="var(--color-revenue)" fillOpacity={0.12} stroke="var(--color-revenue)" strokeWidth={2} />
                <Area dataKey="payrollCost" type="monotone" isAnimationActive={!still} fill="var(--color-payrollCost)" fillOpacity={0.1} stroke="var(--color-payrollCost)" strokeWidth={2} />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gross margin by client</CardTitle>
            <CardDescription>{PERIOD_LABEL}. Tap a bar to open the client.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ChartContainer
              config={marginConfig}
              className="aspect-auto h-[240px] w-full"
              role="img"
              aria-label={`Gross margin by client: ${marginData.map((c) => `${c.name} ${c.marginPct}%`).join(", ")}.`}
            >
              <BarChart data={marginData} layout="vertical" margin={{ left: 0, right: 44 }} barCategoryGap={8} maxBarSize={24} accessibilityLayer>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" hide domain={[0, 40]} />
                <YAxis dataKey="short" type="category" tickLine={false} axisLine={false} width={150} tickMargin={4} />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      hideIndicator
                      labelFormatter={(_, p) => (p?.[0]?.payload as { name?: string } | undefined)?.name ?? ""}
                      formatter={(_, __, item) => {
                        const row = item.payload as (typeof marginData)[number];
                        return (
                          <div className="grid w-full gap-1">
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Margin</span>
                              <span className="font-mono font-medium tabular-nums">
                                {formatMoney(row.margin)} · {row.marginPct}%
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-muted-foreground">Revenue</span>
                              <span className="font-mono tabular-nums">{formatMoney(row.revenue)}</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="marginPctN" isAnimationActive={!still} fill="var(--color-marginPct)" radius={4} className="cursor-pointer" onClick={(d) => navigate(`/clients/${(d.payload as { clientId: string }).clientId}`)}>
                  <LabelList dataKey="marginPctN" position="right" className="fill-foreground" fontSize={12} formatter={(v: unknown) => `${Number(v).toFixed(1)}%`} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="attention-h" className="space-y-3">
        <h2 id="attention-h" className="text-sm font-medium text-muted-foreground">
          Needs attention
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Approvals waiting</CardTitle>
              <CardDescription>Two taps each: approve, then confirm the amount.</CardDescription>
              <CardAction>
                <StatusBadge tone="due">{pending.length} pending</StatusBadge>
              </CardAction>
            </CardHeader>
            <CardContent className="px-2">
              <ul className="space-y-0.5">
                {approvals.isPending
                  ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="mx-2 my-2 h-9" />)
                  : pending.map((a) => (
                      <li key={a.id}>
                        <AttentionRow to="/approvals" title={a.title} detail={APPROVAL_KIND_LABELS[a.kind]} value={a.amount ? formatMoney(a.amount) : a.count ? `${a.count.value} ${a.count.noun}` : undefined} />
                      </li>
                    ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link to="/approvals">
                  Open approvals <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
                </Link>
              </Button>
            </CardFooter>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Credit limits</CardTitle>
              <CardDescription>Operations is warned before sending more workers to a client over its limit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {CREDIT_WATCH.map((c) => {
                const used = toNum(pct(c.outstanding, c.limit));
                return (
                  <Link key={c.clientId} to={`/clients/${c.clientId}`} className="block space-y-2 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.over ? <StatusBadge tone="blocked">Over limit</StatusBadge> : <StatusBadge tone="due">Near limit</StatusBadge>}
                    </div>
                    <Progress value={Math.min(100, used)} aria-label={`${c.name}: ${used}% of credit limit used`} className="h-1.5" />
                    <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                      <span>{formatMoney(c.outstanding)} outstanding</span>
                      <span>limit {formatMoney(c.limit, { bare: true })}</span>
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Deployed with expired papers</CardTitle>
              <CardDescription>On a site today with a lapsed mandatory document. Renew or stand down.</CardDescription>
              <CardAction>
                <StatusBadge tone="blocked">{workforce.data ? deployedExpired.length : "…"} workers</StatusBadge>
              </CardAction>
            </CardHeader>
            <CardContent className="px-2">
              <ul className="space-y-0.5">
                {workforce.isPending
                  ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="mx-2 my-2 h-9" />)
                  : deployedExpired.slice(0, 5).map((w) => (
                      <li key={w.id}>
                        <AttentionRow
                          to={`/workers/${w.id}`}
                          title={w.fullName}
                          detail={`${w.code} · ${w.compliance.nextExpiry ? documentLabel(w.compliance.nextExpiry.type) : "Document"}`}
                          value={w.compliance.nextExpiry ? describeExpiry(w.compliance.nextExpiry.daysLeft) : undefined}
                        />
                      </li>
                    ))}
              </ul>
              {workforce.isError && <p className="px-2 text-sm text-destructive">Couldn't load workers. Check the API is running.</p>}
            </CardContent>
            <CardFooter>
              <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                <Link to="/workers?compliance=expired">
                  See all expired <ArrowRightIcon aria-hidden className="rtl:rotate-180" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>
    </Page>
  );
}

function AttentionRow({ to, title, detail, value }: { to: string; title: string; detail: string; value?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      {value && <span className="shrink-0 text-end text-xs font-medium tabular-nums">{value}</span>}
      <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
    </Link>
  );
}
