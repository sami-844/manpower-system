import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "@/lib/theme";
import "./styles.css";
import { SCREENS } from "@/app/screens";
import { AppShell, PageSkeleton } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { isDesktop } from "@/lib/desktop";
import { SessionProvider } from "@/lib/session";
import { SignIn } from "@/pages/shell/SignIn";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true } } });

const NotFound = () => (
  <Empty className="m-6 border">
    <EmptyHeader>
      <EmptyTitle>This page doesn't exist.</EmptyTitle>
      <EmptyDescription>Use the sidebar or press Ctrl+K to find what you need.</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

// HashRouter so the same build works on a web server and inside the Tauri desktop app.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      {/* Aceternity/motion respects the OS "reduce motion" setting everywhere (TR-CLI-03). */}
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            <SessionProvider>
              <HashRouter>
                <Suspense fallback={<PageSkeleton />}>
                  <Routes>
                    <Route path="sign-in" element={<SignIn />} />
                    <Route element={<AppShell />}>
                      {SCREENS.filter((s) => !s.desktopOnly || isDesktop()).map((s) => (
                        <Route key={s.path} path={s.path === "/" ? undefined : s.path.slice(1)} index={s.path === "/"} element={<s.Component />} />
                      ))}
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
              </HashRouter>
              <Toaster richColors closeButton position="bottom-right" />
            </SessionProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
