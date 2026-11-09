/** Show only the last 4 characters of ID and document numbers (Spec §6). */
export function maskNumber(value: string | null): string | null {
  if (!value) return value;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}
