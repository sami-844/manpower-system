import { useNavigate } from "react-router-dom";
import { BellIcon, ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserRoundCogIcon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { DEMO_ACCOUNTS, ROLE_LABELS } from "@/lib/roles";
import { useSession } from "@/lib/session";

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function NavUser() {
  const { isMobile } = useSidebar();
  const { account, signIn, signOut } = useSession();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  if (!account) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initials(account.displayName)}</AvatarFallback>
              </Avatar>
              <span className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-medium">{account.displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[account.role]}</span>
              </span>
              <ChevronsUpDownIcon className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-60 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="font-normal">
              <div className="grid text-sm leading-tight">
                <span className="font-medium">{account.displayName}</span>
                <span className="text-xs text-muted-foreground">{account.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => navigate("/notifications")}>
                <BellIcon />
                Notifications
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <UserRoundCogIcon />
                  Switch role (demo)
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-56">
                  <DropdownMenuRadioGroup
                    value={account.username}
                    onValueChange={(u) => {
                      const next = DEMO_ACCOUNTS.find((a) => a.username === u);
                      if (next) {
                        signIn(next);
                        navigate(next.role === "owner" ? "/dashboard" : "/");
                      }
                    }}
                  >
                    {DEMO_ACCOUNTS.map((a) => (
                      <DropdownMenuRadioItem key={a.username} value={a.username}>
                        <span className="grid leading-tight">
                          <span>{ROLE_LABELS[a.role]}</span>
                          <span className="text-xs text-muted-foreground">{a.displayName}</span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {theme === "dark" ? <MoonIcon /> : theme === "light" ? <SunIcon /> : <MonitorIcon />}
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
                    <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                signOut();
                navigate("/sign-in");
              }}
            >
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
