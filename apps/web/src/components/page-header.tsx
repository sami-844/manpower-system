/**
 * List and detail page header (Design Brief "Layouts"): title and primary action top-right.
 * `screen` is the App Flow screen ID (S-xx), kept as a data attribute for tests and traceability.
 * `sample` marks screens whose module has no API yet and runs on the fictional demo layer.
 */
import type { ReactNode } from "react";
import { FlaskConicalIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function PageHeader({
  title,
  description,
  actions,
  screen,
  sample = false,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  screen?: string;
  sample?: boolean;
  /** Badges or key facts under the title (detail pages: code, status). */
  meta?: ReactNode;
}) {
  return (
    <div data-screen={screen} className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-balance md:text-2xl">{title}</h1>
          {sample && <SampleDataBadge />}
        </div>
        {description && <p className="max-w-3xl text-sm text-muted-foreground text-pretty">{description}</p>}
        {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SampleDataBadge({
  label = "Sample data",
  tip = "Fictional demo figures. This module's API arrives in its sprint (Implementation Plan); the screen and flow are final.",
}: { label?: string; tip?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-dashed border-highlight/60 bg-highlight/10 px-2 text-[11px] font-medium whitespace-nowrap text-highlight-foreground dark:text-highlight">
          <FlaskConicalIcon aria-hidden className="size-3" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tip}</TooltipContent>
    </Tooltip>
  );
}

/** Standard page body spacing used by every screen inside the shell. */
export function Page({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-6 p-4 md:p-6">{children}</div>;
}
