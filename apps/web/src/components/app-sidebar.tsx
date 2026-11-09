/**
 * Office app sidebar (Design Brief "Layouts"), adapted from the shadcn dashboard-01 block.
 * Collapses to icons (Ctrl+B, or at 1366 px by user choice); groups the role cannot use don't appear.
 */
import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRightIcon, HardHatIcon } from "lucide-react";
import { NAV_MODULES, NAV_OVERVIEW, NAV_SETTINGS, type NavGroup } from "@/app/nav";
import { isActivePath } from "@/app/use-current-screen";
import { NavUser } from "@/components/nav-user";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { isDesktop } from "@/lib/desktop";
import { useSession } from "@/lib/session";
import { useQuery } from "@tanstack/react-query";
import { pendingApprovalsCount as initialPending } from "@/demo/notifications";
import { fetchApprovals } from "@/demo/insight";

function NavGroupItems({ groups, pathname }: { groups: NavGroup[]; pathname: string }) {
  // Same query as the Approvals inbox, so the badge drops as items are decided.
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: fetchApprovals });
  const pendingApprovalsCount = approvals.data?.pending.length ?? initialPending;
  return (
    <SidebarMenu>
      {groups.map((g) => {
        if (g.path) {
          const active = isActivePath(pathname, g.path);
          return (
            <SidebarMenuItem key={g.title}>
              <SidebarMenuButton asChild isActive={active} tooltip={g.title}>
                <Link to={g.path} aria-current={active ? "page" : undefined}>
                  <g.icon />
                  <span>{g.title}</span>
                </Link>
              </SidebarMenuButton>
              {g.path === "/approvals" && pendingApprovalsCount > 0 && <SidebarMenuBadge className="tabular-nums">{pendingApprovalsCount}</SidebarMenuBadge>}
            </SidebarMenuItem>
          );
        }
        const open = g.items?.some((i) => isActivePath(pathname, i.path)) ?? false;
        return (
          <Collapsible key={g.title} asChild defaultOpen={open} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={g.title}>
                  <g.icon />
                  <span>{g.title}</span>
                  <ChevronRightIcon className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:-scale-x-100" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {g.items?.map((i) => {
                    const active = isActivePath(pathname, i.path);
                    return (
                      <SidebarMenuSubItem key={i.path}>
                        <SidebarMenuSubButton asChild isActive={active}>
                          <Link to={i.path} aria-current={active ? "page" : undefined}>
                            <span>{i.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    );
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation();
  const { can } = useSession();
  const visible = (gs: NavGroup[]) => gs.filter((g) => can(g.area) && (g.area !== "desktop" || isDesktop()));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Manpower Management System">
              <Link to="/">
                <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <HardHatIcon className="size-4" />
                </span>
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate text-sm font-semibold">Manpower</span>
                  <span className="truncate text-xs text-muted-foreground">Management System</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Overview</SidebarGroupLabel>
          <NavGroupItems groups={visible(NAV_OVERVIEW)} pathname={pathname} />
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Modules</SidebarGroupLabel>
          <NavGroupItems groups={visible(NAV_MODULES)} pathname={pathname} />
        </SidebarGroup>
        {visible(NAV_SETTINGS).length > 0 && (
          <SidebarGroup className="mt-auto">
            <NavGroupItems groups={visible(NAV_SETTINGS)} pathname={pathname} />
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
