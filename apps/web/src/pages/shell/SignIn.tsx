/**
 * S-01 Sign in. Demo stand-in for Amazon Cognito with MFA (S2): pick one of the six Version 1
 * office roles. Background Beams is the one Aceternity piece the Design Brief allows here
 * (first impression, no working content); motion respects prefers-reduced-motion.
 */
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRightIcon, HardHatIcon, ShieldCheckIcon } from "lucide-react";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DEMO_ACCOUNTS, ROLE_LABELS } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { initials } from "@/components/nav-user";

export function SignIn() {
  const { account, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState(DEMO_ACCOUNTS[0]!.username);
  const from = (location.state as { from?: string } | null)?.from;
  if (account) return <Navigate to={from ?? "/"} replace />;

  const submit = () => {
    const a = DEMO_ACCOUNTS.find((x) => x.username === username)!;
    signIn(a);
    // App Flow front doors: the owner opens on the dashboard, office roles on Today.
    navigate(from ?? (a.role === "owner" ? "/dashboard" : "/"), { replace: true });
  };

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      <BackgroundBeams className="pointer-events-none opacity-70" />
      <div className="relative z-10 w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <HardHatIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Manpower Management System</h1>
            <p className="text-sm text-muted-foreground">Workers, compliance, rosters, payroll and billing in one place.</p>
          </div>
        </div>
        <Card className="shadow-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Demo accounts: choose a role to see the app the way that person does.</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={username} onValueChange={setUsername} aria-label="Demo account" className="gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <Label
                    key={a.username}
                    htmlFor={`acct-${a.username}`}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem id={`acct-${a.username}`} value={a.username} />
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">{initials(a.displayName)}</span>
                    <span className="grid flex-1 leading-tight">
                      <span className="text-sm font-medium">{ROLE_LABELS[a.role]}</span>
                      <span className="text-xs font-normal text-muted-foreground">{a.displayName}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </CardContent>
            <CardFooter className="mt-4 flex-col gap-3">
              <Button type="submit" className="w-full" size="lg">
                Continue
                <ArrowRightIcon data-icon="inline-end" className="rtl:rotate-180" />
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="size-3.5" />
                Live accounts sign in with two-factor (Amazon Cognito) from Sprint 2.
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
