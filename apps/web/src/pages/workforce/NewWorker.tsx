/**
 * S-07 New worker (App Flow "new worker to deployable", step 1). Creates the worker through the
 * real `POST /api/workers`; when passport details are given, also records the passport through
 * `POST /api/workers/:id/documents` (unverified until HR checks it).
 * The "Read passport (OCR)" panel is a PREVIEW of the OCR step: it never uploads anything and
 * fills fictional details for HR to check.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, LoaderCircleIcon, ScanLineIcon, SparklesIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dates, rng, todayOman } from "@/demo/core";
import { TRADES } from "@/demo/reference";
import { useWorkforce } from "@/demo/workforce";
import { FieldErrors } from "@/components/FieldErrors";
import { Page, PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { NativeSelect } from "./shared";

type Form = {
  fullName: string;
  fullNameAr: string;
  nationality: string;
  trade: string;
  phone: string;
  dateOfBirth: string;
  joinedOn: string;
  status: "available" | "in_recruitment";
  passportNumber: string;
  passportIssued: string;
  passportExpiry: string;
};
type Key = keyof Form;

const NATIONALITIES = ["Bangladesh", "India", "Nepal", "Pakistan", "Sri Lanka", "Philippines"];
const OCR_STEPS = ["Finding the passport page", "Reading the machine-readable zone", "Checking the check digits", "Filling in the form"];

// Fictional names for the OCR preview (CLAUDE.md rule 11: never real people).
const OCR_PEOPLE: [string, string][] = [
  ["Ramesh Thapa", "Nepal"],
  ["Bikram Gurung", "Nepal"],
  ["Abdul Rahman Mia", "Bangladesh"],
  ["Kamal Hossain", "Bangladesh"],
  ["Suresh Pillai", "India"],
  ["Prakash Kumar", "India"],
  ["Imran Iqbal", "Pakistan"],
  ["Tariq Mahmood", "Pakistan"],
];

function Field({ id, label, hint, ocr, children }: { id: string; label: string; hint?: string; ocr?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {ocr && (
          <span className="inline-flex items-center gap-1 text-xs text-highlight-foreground dark:text-highlight">
            <SparklesIcon aria-hidden className="size-3" />
            From OCR, check
          </span>
        )}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NewWorker() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const workforce = useWorkforce();
  const [form, setForm] = useState<Form>(() => ({
    fullName: "",
    fullNameAr: "",
    nationality: "",
    trade: "",
    phone: "",
    dateOfBirth: "",
    joinedOn: todayOman(),
    status: "available",
    passportNumber: "",
    passportIssued: "",
    passportExpiry: "",
  }));
  const [fromOcr, setFromOcr] = useState<Set<Key>>(new Set());
  const set = (k: Key) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    setFromOcr((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : s));
  };

  // Duplicate hint: same name already on the books (case and spacing ignored).
  const name = useDeferredValue(form.fullName.trim().toLowerCase().replace(/\s+/g, " "));
  const duplicates = useMemo(() => {
    if (name.length < 4 || !workforce.data) return [];
    return workforce.data.filter((w) => w.fullName.toLowerCase() === name).slice(0, 3);
  }, [name, workforce.data]);

  const create = useMutation({
    mutationFn: async (f: Form) => {
      const worker = await api.post<{ id: string; code: string; fullName: string }>("/api/workers", {
        fullName: f.fullName,
        fullNameAr: f.fullNameAr || undefined,
        nationality: f.nationality,
        trade: f.trade,
        status: f.status,
        phone: f.phone || undefined,
        dateOfBirth: f.dateOfBirth || undefined,
        joinedOn: f.joinedOn || undefined,
      });
      if (f.passportNumber && f.passportExpiry) {
        await api.post(`/api/workers/${worker.id}/documents`, {
          type: "passport",
          number: f.passportNumber,
          issueDate: f.passportIssued || undefined,
          expiryDate: f.passportExpiry,
        });
      }
      return worker;
    },
    onSuccess: (w) => {
      void qc.invalidateQueries({ queryKey: ["workers"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      toast.success(`${w.fullName} created as ${w.code}`, { description: "Next: add the residence visa, labour card and medical." });
      navigate(`/workers/${w.id}`);
    },
  });

  const fillFromOcr = (file: File) => {
    const r = rng(`ocr:${file.name}:${file.size}`);
    const [fullName, nationality] = r.pick(OCR_PEOPLE);
    const today = todayOman();
    const expiry = dates.addDays(today, r.int(400, 2900));
    const filled: Partial<Form> = {
      fullName,
      nationality,
      dateOfBirth: `${r.int(1982, 2001)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`,
      passportNumber: `${String.fromCharCode(65 + r.int(0, 25))}${String(r.int(1000000, 9999999))}`,
      passportExpiry: expiry,
      passportIssued: `${Number(expiry.slice(0, 4)) - 10}${expiry.slice(4)}`,
    };
    setForm((f) => ({ ...f, ...filled }));
    setFromOcr(new Set(Object.keys(filled) as Key[]));
  };

  return (
    <Page>
      <PageHeader
        screen="S-07"
        title="New worker"
        description="Create the worker record. The code (W-000…) is issued by the system when you save. Papers are added next, on the worker file."
      />
      <form
        className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
        aria-label="New worker"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(form);
        }}
      >
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identity</CardTitle>
              <CardDescription>As printed on the passport.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field id="nw-name" label="Full name" ocr={fromOcr.has("fullName")}>
                  <Input id="nw-name" value={form.fullName} onChange={set("fullName")} required minLength={2} autoComplete="off" autoFocus />
                </Field>
              </div>
              {duplicates.length > 0 && (
                <Alert className="sm:col-span-2 border-warning/40 bg-warning/10">
                  <TriangleAlertIcon aria-hidden />
                  <AlertTitle>Possible duplicate</AlertTitle>
                  <AlertDescription>
                    <p>A worker with this name is already on the books. Check it isn't the same person before you continue.</p>
                    <ul className="mt-1 space-y-0.5">
                      {duplicates.map((d) => (
                        <li key={d.id}>
                          <Link to={`/workers/${d.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                            {d.fullName}
                          </Link>{" "}
                          <span className="font-mono text-xs">{d.code}</span> · {d.nationality} · {d.trade}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <Field id="nw-name-ar" label="Name in Arabic" hint="Optional. Used on Arabic letters and the WPS file.">
                <Input id="nw-name-ar" dir="rtl" value={form.fullNameAr} onChange={set("fullNameAr")} autoComplete="off" />
              </Field>
              <Field id="nw-dob" label="Date of birth" ocr={fromOcr.has("dateOfBirth")}>
                <Input id="nw-dob" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max={todayOman()} />
              </Field>
              <Field id="nw-nat" label="Nationality" ocr={fromOcr.has("nationality")}>
                <Input id="nw-nat" value={form.nationality} onChange={set("nationality")} required list="nw-nationalities" autoComplete="off" />
                <datalist id="nw-nationalities">
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field id="nw-phone" label="Phone" hint="Oman mobile, for WhatsApp messages.">
                <Input id="nw-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+968 9…" autoComplete="off" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Work</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field id="nw-trade" label="Trade">
                <Input id="nw-trade" value={form.trade} onChange={set("trade")} required list="nw-trades" autoComplete="off" />
                <datalist id="nw-trades">
                  {TRADES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </Field>
              <Field id="nw-joined" label="Joined on">
                <Input id="nw-joined" type="date" value={form.joinedOn} onChange={set("joinedOn")} />
              </Field>
              <Field id="nw-status" label="Starting status">
                <NativeSelect id="nw-status" value={form.status} onChange={set("status")}>
                  <option value="available">Available</option>
                  <option value="in_recruitment">In recruitment</option>
                </NativeSelect>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Passport</CardTitle>
              <CardDescription>Optional here. With a number and expiry date it is saved as the worker's first document, waiting for HR to verify it.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field id="nw-pp" label="Passport number" ocr={fromOcr.has("passportNumber")}>
                <Input id="nw-pp" className="font-mono" value={form.passportNumber} onChange={set("passportNumber")} autoComplete="off" />
              </Field>
              <Field id="nw-pp-issued" label="Passport issued" ocr={fromOcr.has("passportIssued")}>
                <Input id="nw-pp-issued" type="date" value={form.passportIssued} onChange={set("passportIssued")} />
              </Field>
              <Field id="nw-pp-exp" label="Passport expires" ocr={fromOcr.has("passportExpiry")}>
                <Input id="nw-pp-exp" type="date" value={form.passportExpiry} onChange={set("passportExpiry")} />
              </Field>
            </CardContent>
          </Card>

          <FieldErrors error={create.error} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" asChild>
              <Link to="/workers">Cancel</Link>
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
              Create worker
            </Button>
          </div>
        </div>

        <OcrPanel onRead={fillFromOcr} />
      </form>
    </Page>
  );
}

function OcrPanel({ onRead }: { onRead: (file: File) => void }) {
  const [file, setFile] = useState<{ name: string; url: string | null } | null>(null);
  const [step, setStep] = useState(-1);
  const [dragging, setDragging] = useState(false);
  const timers = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  useEffect(() => () => void (file?.url && URL.revokeObjectURL(file.url)), [file]);

  const start = (f: File | undefined) => {
    if (!f) return;
    timers.current.forEach(clearTimeout);
    setFile({ name: f.name, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
    setStep(0);
    timers.current = OCR_STEPS.map((_, i) =>
      window.setTimeout(() => {
        setStep(i + 1);
        if (i === OCR_STEPS.length - 1) onRead(f);
      }, 450 * (i + 1)),
    );
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    start(e.dataTransfer.files[0]);
  };
  const done = step >= OCR_STEPS.length;

  return (
    <Card className="gap-4 lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLineIcon aria-hidden className="size-4 text-muted-foreground" />
          Read passport (OCR)
        </CardTitle>
        <CardDescription>Drop a photo or scan of the passport's photo page to fill the form.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label
          htmlFor="nw-ocr"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed bg-muted/40 p-4 text-center text-sm transition-colors hover:bg-muted has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
            dragging && "border-primary bg-primary/5",
          )}
        >
          {file?.url ? (
            <img src={file.url} alt="Passport page being read" className="max-h-40 rounded-md object-contain" />
          ) : (
            <ScanLineIcon aria-hidden className="size-8 text-muted-foreground" />
          )}
          <span className="font-medium">{file ? file.name : "Drop the passport page here"}</span>
          <span className="text-xs text-muted-foreground">or click to choose · JPG, PNG or PDF</span>
          <input
            ref={inputRef}
            id="nw-ocr"
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            aria-label="Passport scan"
            onChange={(e) => start(e.target.files?.[0])}
          />
        </label>

        {step >= 0 && (
          <div className="space-y-2" aria-live="polite">
            <Progress value={(Math.min(step, OCR_STEPS.length) / OCR_STEPS.length) * 100} aria-label="Reading the passport" />
            <ul className="space-y-1 text-sm">
              {OCR_STEPS.map((s, i) => (
                <li key={s} className={cn("flex items-center gap-2", i > step && "text-muted-foreground")}>
                  {i < step ? (
                    <CircleCheckIcon aria-hidden className="size-3.5 text-success" />
                  ) : i === step ? (
                    <LoaderCircleIcon aria-hidden className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <span aria-hidden className="size-3.5 rounded-full border" />
                  )}
                  {s}
                </li>
              ))}
            </ul>
            {done && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-success">Details filled. Check each marked field.</p>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Clear the scan"
                  onClick={() => {
                    setFile(null);
                    setStep(-1);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  <XIcon />
                </Button>
              </div>
            )}
          </div>
        )}

        <Alert className="border-highlight/40 bg-highlight/10">
          <SparklesIcon aria-hidden />
          <AlertTitle>Preview of the OCR step</AlertTitle>
          <AlertDescription>The scan stays in this browser and the details it fills are fictional. In production the passport reader fills them; HR always checks each one.</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
