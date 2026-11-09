#!/usr/bin/env bun
/**
 * PreToolUse guard for Edit | Write | MultiEdit. Blocks (exit 2, reason on stderr)
 * the edits that CLAUDE.md says must never happen, before they happen:
 *
 *   - secrets:            .env files (except .env.example)
 *   - migrations lock:    apps/api/drizzle/migrations.lock (use `bun run gates --update-lock`)
 *   - applied migrations: any apps/api/drizzle/NNNN_*.sql listed in the lock (rule 9)
 *   - golden cases:       changing or removing a signed expected value or signedBy, or adding
 *                         a case whose expected value is not null (rule 4)
 *
 * Everything else passes (exit 0) to the normal permission flow.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";

type Edit = { old_string: string; new_string: string; replace_all?: boolean };
export type ToolCall = {
  tool_name: string;
  tool_input: { file_path?: string; content?: string; old_string?: string; new_string?: string; replace_all?: boolean; edits?: Edit[] };
  cwd?: string;
};
type Reader = (path: string) => string | null;

const defaultReader: Reader = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function applyEdit(text: string, e: Edit): string {
  return e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, e.new_string);
}

/** The file's content after the tool call, or null if it can't be worked out. */
export function resultingContent(call: ToolCall, current: string | null): string | null {
  const i = call.tool_input;
  if (call.tool_name === "Write") return i.content ?? null;
  if (current === null) return null;
  if (call.tool_name === "Edit" && i.old_string !== undefined && i.new_string !== undefined)
    return applyEdit(current, { old_string: i.old_string, new_string: i.new_string, replace_all: i.replace_all });
  if (call.tool_name === "MultiEdit" && i.edits) return i.edits.reduce(applyEdit, current);
  return null;
}

type Case = Record<string, unknown>;
function cases(json: unknown): Case[] {
  if (Array.isArray(json)) return json as Case[];
  const c = (json as { cases?: unknown })?.cases;
  return Array.isArray(c) ? (c as Case[]) : [];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function checkGolden(before: string | null, after: string | null): string | null {
  if (after === null) return "golden file: could not work out the edited content; edit golden files with Write so the change can be checked";
  let next: unknown;
  try { next = JSON.parse(after); } catch { return "golden file must stay valid JSON"; }
  let prev: unknown = [];
  if (before !== null) { try { prev = JSON.parse(before); } catch { prev = []; } }

  const prevById = new Map(cases(prev).map((c, i) => [String(c.id ?? `#${i}`), c]));
  const nextById = new Map(cases(next).map((c, i) => [String(c.id ?? `#${i}`), c]));

  for (const [id, old] of prevById) {
    const now = nextById.get(id);
    if (!now) return `golden case ${id} was removed — golden cases are never deleted (CLAUDE.md rule 4)`;
    if (!same(old.expected, now.expected)) return `golden case ${id}: expected value changed — only the named signer sets expected values (rule 4). Flag it for sign-off instead`;
    if (!same(old.signedBy, now.signedBy) || !same(old.signedOn, now.signedOn)) return `golden case ${id}: sign-off changed — only the signer records a sign-off`;
  }
  for (const [id, now] of nextById) {
    if (!prevById.has(id) && now.expected !== null) return `new golden case ${id} must have "expected": null — add it for sign-off (rule 4)`;
  }
  if (!same((prev as Case)?.signedBy, (next as Case)?.signedBy) && !Array.isArray(prev)) return "golden file sign-off changed — only the signer records a sign-off";
  return null;
}

function lockedMigrations(root: string, read: Reader): Set<string> {
  const lock = read(join(root, "apps/api/drizzle/migrations.lock")) ?? "";
  return new Set([...lock.matchAll(/^[0-9a-f]{64}\s+(\S+)$/gm)].map((m) => m[1]));
}

/** Returns a reason to block, or null to allow. */
export function check(call: ToolCall, root: string, read: Reader = defaultReader): string | null {
  const file = call.tool_input.file_path;
  if (!file) return null;
  const abs = isAbsolute(file) ? file : join(call.cwd ?? root, file);
  const rel = relative(root, abs).split("\\").join("/");
  if (rel.startsWith("..")) return null;
  const name = basename(rel);

  if (/^\.env(\..+)?$/.test(name) && name !== ".env.example")
    return `${rel}: secrets files are never written by the agent — put placeholders in .env.example`;

  if (rel === "apps/api/drizzle/migrations.lock")
    return "migrations.lock is written only by `bun run gates --update-lock`, never by hand";

  const mig = rel.match(/^apps\/api\/drizzle\/(\d{4}_[^/]+\.sql)$/);
  if (mig && lockedMigrations(root, read).has(mig[1]))
    return `${rel} is an applied migration and is never edited (CLAUDE.md rule 9) — write the next numbered migration instead`;

  if (/(^|\/)golden\/[^/]+\.json$/.test(rel)) {
    const before = read(abs);
    return checkGolden(before, resultingContent(call, before));
  }
  return null;
}

if (import.meta.main) {
  const input = await Bun.stdin.text();
  let call: ToolCall;
  try { call = JSON.parse(input); } catch { process.exit(0); }
  const root = process.env.CLAUDE_PROJECT_DIR ?? join(import.meta.dir, "../..");
  const reason = check(call, root);
  if (reason) { console.error(`Blocked by .claude/hooks/guard.ts: ${reason}`); process.exit(2); }
  process.exit(0);
}
