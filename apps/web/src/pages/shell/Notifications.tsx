/**
 * S-04 Notifications: alerts and messages with read state (App Flow "Behaviour everywhere:
 * Notifications": in-app first). Opening one marks it read and goes to its subject.
 * DEMO: src/demo/notifications.ts; read state lasts for the session.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanknoteIcon, BellOffIcon, CalendarClockIcon, CheckCheckIcon, CheckIcon, FileClockIcon, ReceiptTextIcon, ServerCogIcon, type LucideIcon } from "lucide-react";
import { fetchNotifications, markNotificationsRead, NOTIFICATION_KIND_LABELS, type NotificationKind } from "@/demo/notifications";
import { displayMoment } from "@/demo/insight";
import { Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  approval: CheckCheckIcon,
  renewal: FileClockIcon,
  timesheet: CalendarClockIcon,
  payroll: BanknoteIcon,
  billing: ReceiptTextIcon,
  system: ServerCogIcon,
};
const KINDS = Object.keys(NOTIFICATION_KIND_LABELS) as NotificationKind[];

export function Notifications() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const [kind, setKind] = useState<NotificationKind | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const markRead = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const all = list.data ?? [];
  const unread = all.filter((n) => !n.read);
  const shown = all.filter((n) => (kind === "all" || n.kind === kind) && (!unreadOnly || !n.read));

  return (
    <Page>
      <PageHeader
        screen="S-04"
        title="Notifications"
        sample
        description="Alerts and messages for you. Approvals and blockers also arrive by email and WhatsApp."
        actions={
          <Button
            variant="outline"
            disabled={unread.length === 0 || markRead.isPending}
            onClick={() => markRead.mutate(unread.map((n) => n.id), { onSuccess: (n) => toast.success(`Marked ${n} notifications as read`) })}
          >
            <CheckCheckIcon aria-hidden /> Mark all read
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup type="single" value={kind} onValueChange={(v) => setKind((v || "all") as NotificationKind | "all")} variant="outline" size="sm" className="flex-wrap" aria-label="Filter by kind">
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          {KINDS.map((k) => {
            const n = all.filter((x) => x.kind === k && !x.read).length;
            return (
              <ToggleGroupItem key={k} value={k}>
                {NOTIFICATION_KIND_LABELS[k]}
                {n > 0 && <span className="ms-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">{n}</span>}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch id="unread-only" checked={unreadOnly} onCheckedChange={setUnreadOnly} />
          <Label htmlFor="unread-only">Unread only ({unread.length})</Label>
        </div>
      </div>

      <Card className="gap-0 overflow-hidden p-0">
        {list.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex gap-3 p-4">
                <Skeleton className="size-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellOffIcon />
              </EmptyMedia>
              <EmptyTitle>You're all caught up</EmptyTitle>
              <EmptyDescription>Nothing {unreadOnly ? "unread " : ""}here. New alerts about your work appear the moment they happen.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y" aria-label="Notifications">
            {shown.map((n) => {
              const Icon = KIND_ICON[n.kind];
              return (
                <li key={n.id} className={cn("group relative flex items-start gap-3 p-4 transition-colors hover:bg-muted/60", !n.read && "bg-primary/[0.03]")}>
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", n.read ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-start after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-none after:focus-visible:ring-2 after:focus-visible:ring-ring after:focus-visible:ring-inset"
                    onClick={() => {
                      if (!n.read) markRead.mutate([n.id]);
                      navigate(n.to);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {!n.read && (
                        <>
                          <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                          <span className="sr-only">Unread: </span>
                        </>
                      )}
                      <span className={cn("text-sm text-pretty", n.read ? "text-foreground/80" : "font-semibold")}>{n.title}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground text-pretty">{n.body}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {NOTIFICATION_KIND_LABELS[n.kind]} · {displayMoment(n.at)}
                    </span>
                  </button>
                  {!n.read && (
                    <Button variant="ghost" size="icon-sm" className="relative z-10 shrink-0" aria-label={`Mark “${n.title}” as read`} onClick={() => markRead.mutate([n.id])}>
                      <CheckIcon aria-hidden />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Page>
  );
}
