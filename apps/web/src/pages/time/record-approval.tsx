/**
 * "Record signed approval" (TR-CLI-15, Backend Schema timesheet_approvals: method signed_pack
 * requires evidence_file_id). Used on S-20 and S-41. Recording without the signed file is
 * impossible: the button stays disabled and says why.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileCheck2Icon, PaperclipIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session";
import { todayOman } from "@/demo/core";
import { clientById, siteById } from "@/demo/reference";
import { clientContact, recordSignedApproval, totalHours, type TimesheetRow } from "@/demo/time";
import { fmtNumber } from "./shared";

export function RecordApprovalDialog({ sheet, trigger }: { sheet: TimesheetRow; trigger: ReactNode }) {
  const { account } = useSession();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const contact = clientContact(sheet.clientId);
  const site = siteById(sheet.siteId)?.name;
  const record = useMutation({
    mutationFn: () => recordSignedApproval(sheet.id, account?.username ?? "", file?.name ?? ""),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["time"] });
      toast.success(`Client approval recorded for ${site} · ${sheet.period.label}`, { description: `Signed pack ${file?.name} filed as evidence. The timesheet is ready to lock.` });
      setOpen(false);
      setFile(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record the approval"),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), !o && setFile(null))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record signed approval</DialogTitle>
          <DialogDescription>
            {site} · {sheet.period.label} · {fmtNumber(totalHours(sheet.totals))} h for {sheet.workers} workers. Signed by {contact?.name} ({clientById(sheet.clientId)?.legalName}).
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`signed-${sheet.id}`}>Signed pack (required)</FieldLabel>
            <Input id={`signed-${sheet.id}`} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-describedby={`signed-help-${sheet.id}`} />
            <FieldDescription id={`signed-help-${sheet.id}`}>
              {file ? (
                <span className="inline-flex items-center gap-1 text-success">
                  <FileCheck2Icon aria-hidden className="size-3.5" />
                  {file.name} will be filed as the approval evidence.
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <PaperclipIcon aria-hidden className="size-3.5" />
                  Attach the client's signed copy. An approval cannot be recorded without it (TR-CLI-15).
                </span>
              )}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`signed-on-${sheet.id}`}>Signed on</FieldLabel>
            <Input id={`signed-on-${sheet.id}`} type="date" defaultValue={todayOman()} max={todayOman()} className="w-44" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={!file || record.isPending} onClick={() => record.mutate()}>
            {file ? `Record approval of ${fmtNumber(totalHours(sheet.totals))} h` : "Attach the signed pack first"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
