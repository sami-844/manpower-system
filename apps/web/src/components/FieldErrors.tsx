import { CircleAlertIcon } from "lucide-react";
import { ApiError } from "../lib/api";

const FIELD_NAMES: Record<string, string> = {
  fullName: "Full name",
  nationality: "Nationality",
  trade: "Trade",
  expiryDate: "Expiry date",
  issueDate: "Issue date",
  from: "From",
  to: "To",
  reason: "Reason",
  validUntil: "Valid until",
  dateOfBirth: "Date of birth",
  joinedOn: "Joined on",
};

/** Say what is wrong and where, in the interface's voice (problem+json issues from the API). */
export function FieldErrors({ error }: { error: unknown }) {
  if (!error) return null;
  const issues = error instanceof ApiError ? error.issues : [];
  const message = error instanceof ApiError ? error.message : "The server didn't respond. Check your connection and try again.";
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {issues.length > 0 ? (
        <ul className="space-y-0.5">
          {issues.map((i) => (
            <li key={i.path + i.message}>
              <span className="font-medium">{FIELD_NAMES[i.path] ?? i.path}:</span> {i.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
}
