/**
 * Office app shell: sidebar + inset content (Design Brief "Layouts"), from the dashboard-01 block.
 * Signed-out visitors go to S-01; areas the role cannot use show a plain "no access" page.
 */
import { Suspense, type CSSProperties } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldOffIcon } from "lucide-react";
import { useCurrentScreen } from "@/app/use-current-screen";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";

export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

function NoAccess() {
  const { account } = useSession();
  return (
    <Empty className="m-6 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldOffIcon />
        </EmptyMedia>
        <EmptyTitle>This area isn't part of your role</EmptyTitle>
        <EmptyDescription>
          {account ? `${ROLE_LABELS[account.role]} accounts` : "Your account"} can't open this screen. Ask the system admin if you need access.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/">Back to Today</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function AppShell() {
  const { account, can } = useSession();
  const location = useLocation();
  const screen = useCurrentScreen();
  if (!account) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  const allowed = !screen || can(screen.area);

  return (
    <SidebarProvider style={{ "--sidebar-width": "16rem", "--header-height": "3.5rem" } as CSSProperties}>
      <AppSidebar variant="inset" />
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="@container/main flex flex-1 flex-col">
          <Suspense fallback={<PageSkeleton />}>{allowed ? <Outlet /> : <NoAccess />}</Suspense>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
