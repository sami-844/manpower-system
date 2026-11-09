/**
 * Global search and commands — S-03 (Ctrl+K). Finds any screen, worker (live from the API),
 * client or site, and runs common actions. Screens the role cannot use don't appear.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2Icon, FileUpIcon, HardHatIcon, MapPinIcon, MoonIcon, UserPlusIcon, UserRoundIcon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { SCREENS } from "@/app/screens";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { ComplianceBadge } from "@/components/status-badge";
import { api, type WorkerListItem } from "@/lib/api";
import { isDesktop } from "@/lib/desktop";
import { useSession } from "@/lib/session";
import { CLIENTS, SITES, clientById } from "@/demo/reference";

export function useCommandMenuShortcut(setOpen: (fn: (o: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { can } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const term = query.trim();

  const workers = useQuery({
    queryKey: ["command", "workers", term],
    queryFn: () => api.get<{ items: WorkerListItem[] }>(`/api/workers?limit=8&search=${encodeURIComponent(term)}`),
    enabled: open && term.length >= 2,
    staleTime: 30_000,
  });

  const go = (path: string) => {
    onOpenChange(false);
    setQuery("");
    navigate(path);
  };

  const screens = SCREENS.filter((s) => !s.path.includes(":") && can(s.area) && (!s.desktopOnly || isDesktop()));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find a worker, client, site or screen">
      <CommandInput placeholder="Search workers, clients, sites, screens…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{workers.isFetching ? "Searching…" : "No results."}</CommandEmpty>
        {can("workforce") && (workers.data?.items.length ?? 0) > 0 && (
          <CommandGroup heading="Workers">
            {workers.data!.items.map((w) => (
              <CommandItem key={w.id} value={`worker ${w.code} ${w.fullName}`} onSelect={() => go(`/workers/${w.id}`)}>
                <UserRoundIcon />
                <span className="truncate">{w.fullName}</span>
                <span className="font-mono text-xs text-muted-foreground">{w.code}</span>
                <span className="ms-auto">
                  <ComplianceBadge state={w.compliance.state} daysLeft={w.compliance.nextExpiry?.daysLeft} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {screens.map((s) => (
            <CommandItem key={s.path} value={`${s.title} ${s.id} ${s.keywords ?? ""}`} onSelect={() => go(s.path)}>
              <span>{s.title}</span>
              <CommandShortcut className="font-mono">{s.id}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        {can("commercial") && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients and sites">
              {CLIENTS.map((c) => (
                <CommandItem key={c.id} value={`client ${c.code} ${c.legalName}`} onSelect={() => go(`/clients/${c.id}`)}>
                  <Building2Icon />
                  {c.legalName}
                  <CommandShortcut className="font-mono">{c.code}</CommandShortcut>
                </CommandItem>
              ))}
              {SITES.map((s) => (
                <CommandItem key={s.id} value={`site ${s.code} ${s.name}`} onSelect={() => go(`/clients/${s.clientId}`)}>
                  <MapPinIcon />
                  {s.name}
                  <span className="text-xs text-muted-foreground">{clientById(s.clientId)?.legalName}</span>
                  <CommandShortcut className="font-mono">{s.code}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {can("workforce") && (
            <CommandItem value="action new worker create" onSelect={() => go("/workers/new")}>
              <UserPlusIcon />
              New worker
            </CommandItem>
          )}
          {can("workforce") && (
            <CommandItem value="action upload document scan" onSelect={() => go("/documents/upload")}>
              <FileUpIcon />
              Upload documents
            </CommandItem>
          )}
          {can("operations") && (
            <CommandItem value="action roster assign" onSelect={() => go("/roster")}>
              <HardHatIcon />
              Open roster board
            </CommandItem>
          )}
          <CommandItem
            value="action toggle dark light theme"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              onOpenChange(false);
            }}
          >
            <MoonIcon />
            Toggle dark mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
