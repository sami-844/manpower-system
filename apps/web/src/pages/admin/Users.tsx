/**
 * S-36 Admin: users and roles (Backend Schema `users`, `roles`, `role_permissions`,
 * `user_roles` with site/client scope). Version 1 issues accounts for the six office roles;
 * supervisor, client and worker roles exist but get no accounts until Version 2 (CLAUDE.md).
 * The permission matrix is built from ROLE_AREAS, the same table that filters the sidebar.
 * DEMO: src/demo/admin.ts until `/users` and `/roles` exist.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, MinusIcon, MoreHorizontalIcon, ShieldCheckIcon, ShieldOffIcon, UserPlusIcon } from "lucide-react";
import { AREAS, ROLE_AREAS, ROLE_LABELS, ROLES, V1_ROLES, type Area, type Role, type V1Role } from "@/lib/roles";
import { fetchUsers, inviteUser, ROLE_DESCRIPTIONS, setUserStatus, V2_ROLES, type DemoUser } from "@/demo/admin";
import { displayMoment } from "@/demo/insight";
import { SITES } from "@/demo/reference";
import { Page, PageHeader } from "@/components/page-header";
import { createColumns, DataTable } from "@/components/data-table";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const AREA_LABELS: Record<Area, string> = {
  today: "Today and notifications",
  insight: "Dashboard and approvals",
  workforce: "Workers and documents",
  compliance: "Compliance and renewals",
  commercial: "Clients and rate cards",
  operations: "Requests and roster",
  time: "Attendance and timesheets",
  payroll: "Payroll and WPS",
  billing: "Invoices and receivables",
  finance: "Ledger and supplier bills",
  reports: "Reports",
  admin: "Users, rules and audit",
  desktop: "Desktop printing",
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter((p) => p.length > 2 || p === p.toUpperCase())
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

export function Users() {
  const users = useQuery({ queryKey: ["admin-users"], queryFn: fetchUsers });
  const count = (r: Role) => users.data?.filter((u) => u.role === r && u.status !== "suspended").length ?? 0;

  return (
    <Page>
      <PageHeader
        screen="S-36"
        title="Users and roles"
        sample
        description="Who can sign in, what each role can see, and which sites or clients they are limited to. Sign-in and MFA come from Amazon Cognito."
        actions={<InviteDialog />}
      />
      <Tabs defaultValue="users" className="gap-4">
        <TabsList>
          <TabsTrigger value="users">Users{users.data ? ` (${users.data.length})` : ""}</TabsTrigger>
          <TabsTrigger value="roles">Roles and permissions ({ROLES.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <DataTable
            label="Users"
            columns={userColumns}
            data={users.data}
            loading={users.isPending}
            getRowId={(u) => u.id}
            search={(u, q) => u.displayName.toLowerCase().includes(q) || u.email.includes(q) || ROLE_LABELS[u.role].toLowerCase().includes(q)}
            searchPlaceholder="Filter by name, email or role…"
            empty="No users yet. Invite the first office user."
          />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ROLES.map((r) => {
              const v2 = (V2_ROLES as readonly Role[]).includes(r);
              return (
                <Card key={r} className={cn("gap-2 py-4", v2 && "border-dashed bg-muted/30 shadow-none")}>
                  <CardHeader className="px-4">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      {ROLE_LABELS[r]}
                      {v2 ? <Badge variant="outline">Version 2</Badge> : <span className="text-xs font-normal text-muted-foreground tabular-nums">{count(r)} active</span>}
                    </CardTitle>
                    <CardDescription className="text-xs text-pretty">{ROLE_DESCRIPTIONS[r]}</CardDescription>
                  </CardHeader>
                  {v2 && <CardContent className="px-4 text-xs text-muted-foreground">Built into the API and permissions now. No accounts are issued until Version 2.</CardContent>}
                </Card>
              );
            })}
          </div>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Permission matrix</CardTitle>
              <CardDescription>Areas each role can open. Default deny; the API enforces the same table, so hiding a menu is never the only guard.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table aria-label="Permissions by role">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-48">Area</TableHead>
                    {ROLES.map((r) => (
                      <TableHead key={r} className="text-center text-xs whitespace-normal">
                        <div className="mx-auto max-w-24">{ROLE_LABELS[r]}</div>
                        {(V2_ROLES as readonly Role[]).includes(r) && (
                          <Badge variant="outline" className="mt-1 h-4 px-1 text-[10px]">
                            V2
                          </Badge>
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {AREAS.map((area) => (
                    <TableRow key={area}>
                      <TableCell className="font-medium">{AREA_LABELS[area]}</TableCell>
                      {ROLES.map((r) => {
                        const v1 = (V1_ROLES as readonly Role[]).includes(r);
                        const yes = v1 && ROLE_AREAS[r as V1Role].includes(area);
                        return (
                          <TableCell key={r} className={cn("text-center", !v1 && "bg-muted/40")}>
                            {!v1 ? (
                              <span className="text-xs text-muted-foreground">
                                <span aria-hidden>·</span>
                                <span className="sr-only">Version 2</span>
                              </span>
                            ) : yes ? (
                              <CheckIcon aria-label="Allowed" className="mx-auto size-4 text-success" />
                            ) : (
                              <MinusIcon aria-label="Not allowed" className="mx-auto size-4 text-muted-foreground/50" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">
                Version 2 roles see only their own records: supervisors their sites, client contacts their company, workers themselves.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

function StatusCell({ u }: { u: DemoUser }) {
  if (u.status === "active") return <StatusBadge tone="ok">Active</StatusBadge>;
  if (u.status === "invited") return <StatusBadge tone="due">Invited</StatusBadge>;
  return <StatusBadge tone="blocked">Suspended</StatusBadge>;
}

function RowActions({ u }: { u: DemoUser }) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (status: DemoUser["status"]) => setUserStatus(u.id, status),
    onSuccess: (x) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(x.status === "suspended" ? `${x.displayName} can no longer sign in` : `${x.displayName} is active again`, { description: "Recorded in the audit trail." });
    },
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.displayName}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontalIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {u.status === "invited" && <DropdownMenuItem onSelect={() => toast.success(`Invitation sent again to ${u.email}`)}>Resend invitation</DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => toast.success(`MFA reset for ${u.displayName}`, { description: "They set it up again at next sign-in." })}>Reset MFA</DropdownMenuItem>
        {u.status === "suspended" ? (
          <DropdownMenuItem onSelect={() => change.mutate("active")}>Reactivate</DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => change.mutate("suspended")}>
            Suspend sign-in
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const col = createColumns<DemoUser>();
const userColumns = col.columns([
  col.accessor("displayName", {
    header: "User",
    cell: ({ row }) => (
      <div className="flex items-center gap-2.5">
        <Avatar className="size-7">
          <AvatarFallback className="text-[11px]">{initials(row.original.displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate font-medium">{row.original.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{row.original.email}</div>
        </div>
      </div>
    ),
  }),
  col.accessor("role", {
    header: "Role",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div>{ROLE_LABELS[row.original.role]}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.title}</div>
      </div>
    ),
  }),
  col.accessor("scope", { header: "Scope", cell: (c) => <span className={cn(c.getValue().startsWith("All") && "text-muted-foreground")}>{c.getValue()}</span> }),
  col.accessor("status", { header: "Status", cell: ({ row }) => <StatusCell u={row.original} /> }),
  col.accessor("mfa", {
    header: "MFA",
    cell: (c) =>
      c.getValue() ? (
        <span className="inline-flex items-center gap-1 text-sm">
          <ShieldCheckIcon aria-hidden className="size-4 text-success" /> On
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <ShieldOffIcon aria-hidden className="size-4" /> Not set up
        </span>
      ),
  }),
  col.accessor("lastSignInAt", { header: "Last sign-in", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.getValue() ? displayMoment(c.getValue()) : "Never"}</span> }),
  col.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, cell: ({ row }) => <RowActions u={row.original} /> }),
]);

const SCOPES = ["All sites and clients", "Sohar sites (3)", "Muscat sites (3)", "Duqm and Nizwa sites (2)", ...SITES.map((s) => `${s.name} only`)];

function InviteDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<V1Role | "">("");
  const [scope, setScope] = useState(SCOPES[0]!);
  const [submitted, setSubmitted] = useState(false);
  const errors = {
    name: name.trim().length < 3 ? "Enter the person's full name." : null,
    email: /^\S+@\S+\.\S+$/.test(email.trim()) ? null : "Enter a work email address.",
    role: role ? null : "Choose a role.",
  };
  const reset = () => {
    setName("");
    setEmail("");
    setRole("");
    setScope(SCOPES[0]!);
    setSubmitted(false);
  };
  const invite = useMutation({
    mutationFn: () => inviteUser({ displayName: name, email, role: role as V1Role, scope }),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(`Invitation sent to ${u.email}`, { description: `${ROLE_LABELS[u.role]} · ${u.scope}. They set a password and MFA on first sign-in.` });
      setOpen(false);
      reset();
    },
    onError: (e) => toast.error("Couldn't send the invitation", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>Version 1 accounts are for office roles, the owner and the admin. Supervisor, client and worker accounts open in Version 2.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (!errors.name && !errors.email && !errors.role) invite.mutate();
          }}
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={submitted && !!errors.name}>
              <FieldLabel htmlFor="inv-name">Full name</FieldLabel>
              <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={submitted && !!errors.name} autoFocus />
              {submitted && errors.name && <FieldError>{errors.name}</FieldError>}
            </Field>
            <Field data-invalid={submitted && !!errors.email}>
              <FieldLabel htmlFor="inv-email">Work email</FieldLabel>
              <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={submitted && !!errors.email} placeholder="name@demo.mms" />
              {submitted && errors.email && <FieldError>{errors.email}</FieldError>}
            </Field>
            <Field data-invalid={submitted && !!errors.role}>
              <FieldLabel htmlFor="inv-role">Role</FieldLabel>
              <Select value={role} onValueChange={(v) => setRole(v as V1Role)}>
                <SelectTrigger id="inv-role" className="w-full" aria-invalid={submitted && !!errors.role}>
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {V1_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {submitted && errors.role ? <FieldError>{errors.role}</FieldError> : role && <FieldDescription>{ROLE_DESCRIPTIONS[role]}</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="inv-scope">Scope</FieldLabel>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="inv-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>Limits which sites' workers and clients this person sees.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={invite.isPending}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
