/**
 * Small pieces shared by the Workforce & Compliance screens (S-05 … S-11).
 */
import { useState, type ComponentProps } from "react";
import { CheckIcon, ChevronDownIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/format";
import type { WorkerListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A native `<select>` styled like the shadcn Input. Native on purpose: keyboard and screen-reader
 * behaviour for free, and the e2e journeys pick options by label.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className={cn("relative", className)}>
      <select
        className="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent ps-2.5 pe-8 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 [&>option]:bg-popover [&>option]:text-popover-foreground"
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  deployed: "bg-primary",
  available: "bg-success",
  on_leave: "bg-warning",
  in_recruitment: "bg-muted-foreground",
  absconding_reported: "bg-destructive",
  exited: "bg-border",
};

/**
 * Worker employment status as a quiet dot + word. Deliberately NOT a StatusBadge: the paper
 * status is the badge on worker rows, so the two never compete (and e2e reads `.tag` as papers).
 */
export function WorkerStatusText({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-sm", className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_DOT[status] ?? "bg-muted-foreground")} />
      {statusLabel(status)}
    </span>
  );
}

/** Search the real worker list (≈700) by name or code. */
export function WorkerPicker({
  id,
  workers,
  value,
  onChange,
  loading = false,
  placeholder = "Choose a worker",
  invalid = false,
}: {
  id?: string;
  workers: readonly WorkerListItem[] | undefined;
  value: string | null;
  onChange: (worker: WorkerListItem) => void;
  loading?: boolean;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = workers?.find((w) => w.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{selected.fullName}</span>
              <span className="font-mono text-xs text-muted-foreground">{selected.code}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{loading ? "Loading workers…" : placeholder}</span>
          )}
          <ChevronsUpDownIcon aria-hidden className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Name or code…" />
          <CommandList>
            <CommandEmpty>No worker matches.</CommandEmpty>
            <CommandGroup>
              {workers?.map((w) => (
                <CommandItem
                  key={w.id}
                  value={`${w.fullName} ${w.code}`}
                  onSelect={() => {
                    onChange(w);
                    setOpen(false);
                  }}
                >
                  <CheckIcon aria-hidden className={cn("size-4", w.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{w.fullName}</span>
                  <span className="ms-auto font-mono text-xs text-muted-foreground">{w.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
