/**
 * Top bar (Design Brief "Layouts"): breadcrumb, Ctrl+K search, notifications. Adapted from the
 * dashboard-01 block's SiteHeader.
 */
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { BellIcon, SearchIcon } from "lucide-react";
import { NAV_MODULES, NAV_OVERVIEW, NAV_SETTINGS } from "@/app/nav";
import { screenByPath } from "@/app/screens";
import { useCurrentScreen } from "@/app/use-current-screen";
import { CommandMenu, useCommandMenuShortcut } from "@/components/command-menu";
import { SampleDataBadge } from "@/components/page-header";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useQuery } from "@tanstack/react-query";
import { fetchNotifications, unreadCount as initialUnread } from "@/demo/notifications";

const GROUPS = [...NAV_OVERVIEW, ...NAV_MODULES, ...NAV_SETTINGS];
const groupOf = (path: string) => GROUPS.find((g) => g.items?.some((i) => i.path === path));

function useCrumbs() {
  const screen = useCurrentScreen();
  if (!screen) return [];
  const crumbs: { title: string; to?: string }[] = [];
  const listPath = screen.parent ?? screen.path;
  const group = groupOf(listPath);
  if (group) crumbs.push({ title: group.title });
  if (screen.parent) {
    const parent = screenByPath(screen.parent);
    if (parent) crumbs.push({ title: parent.title, to: parent.path });
  }
  crumbs.push({ title: screen.title });
  // "Clients › Clients" says nothing twice.
  return crumbs.filter((c, i) => i === 0 || c.title !== crumbs[i - 1]!.title);
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  useCommandMenuShortcut(setOpen);
  const crumbs = useCrumbs();
  // Same query as the Notifications screen, so the bell follows "mark as read".
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const unreadCount = notifications.data?.filter((n) => !n.read).length ?? initialUnread;

  return (
    <header data-print-hide className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ms-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap">
            {crumbs.map((c, i) => (
              <Fragment key={`${c.title}-${i}`}>
                {i > 0 && <BreadcrumbSeparator className={i < crumbs.length - 1 ? "hidden md:block" : undefined} />}
                <BreadcrumbItem className={i < crumbs.length - 1 ? "hidden md:inline-flex" : "min-w-0"}>
                  {i === crumbs.length - 1 ? (
                    <BreadcrumbPage className="truncate">{c.title}</BreadcrumbPage>
                  ) : c.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={c.to}>{c.title}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <span>{c.title}</span>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ms-auto flex items-center gap-2">
          {import.meta.env.MODE === "demo" && (
            <span className="hidden md:inline-flex">
              <SampleDataBadge label="Hosted demo" tip="Every person and figure here is fictional. Your changes stay in this browser tab and reset when you reload." />
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-9 justify-start gap-2 px-2 text-muted-foreground sm:w-64">
            <SearchIcon />
            <span className="hidden sm:inline">Search…</span>
            <KbdGroup className="ms-auto hidden sm:inline-flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link to="/notifications" aria-label={`Notifications, ${unreadCount} unread`}>
              <BellIcon />
              {unreadCount > 0 && (
                <span className="absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground tabular-nums">
                  {unreadCount}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </div>
      <CommandMenu open={open} onOpenChange={setOpen} />
    </header>
  );
}
