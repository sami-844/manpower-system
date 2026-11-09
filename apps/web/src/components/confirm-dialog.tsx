/**
 * Confirm for money and legal actions (Design Brief principle 5, App Flow "Dangerous actions").
 * The button names the action with the amount or count ("Release 684 salaries (OMR 214,350.500)"),
 * never "OK". Pass `typeToConfirm` (e.g. the period name) for releasing payroll, issuing
 * invoices or closing a period: nothing irreversible happens in one click.
 */
import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  typeToConfirm,
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description: ReactNode;
  /** The action, with amount or count. */
  confirmLabel: string;
  typeToConfirm?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;
  return (
    <AlertDialog onOpenChange={(open) => !open && setTyped("")}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm && (
          <div className="grid gap-2">
            <Label htmlFor="confirm-type">
              Type <span className="font-mono font-semibold text-foreground">{typeToConfirm}</span> to confirm
            </Label>
            <Input id="confirm-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!ready} onClick={onConfirm} variant={destructive ? "destructive" : "default"}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
