#!/usr/bin/env bun
/**
 * SessionStart: put the build state in front of the agent before the first prompt,
 * so "read docs/PROGRESS.md first" happens even when nobody types /remember restore.
 * Prints a short summary only; the full files stay on disk for /remember restore.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? join(import.meta.dir, "../..");
const read = (p: string) => (existsSync(join(root, p)) ? readFileSync(join(root, p), "utf8") : "");

const progress = read("docs/PROGRESS.md");
const header = progress.split("\n").filter((l) => /^\*\*(Release|Current phase|Current sprint|Current step|Last session|Gates on)/.test(l));
const blocked = (progress.split(/^## Blocked\s*$/m)[1] ?? "").split(/^## /m)[0].split("\n").filter((l) => l.startsWith("- "));

const decisions = read("docs/DECISIONS.md");
const open = (decisions.split(/^## UNANSWERED\s*$/m)[1] ?? "").split(/^## ANSWERED/m)[0].match(/^### D\d+ — .+$/gm) ?? [];

const lines = [
  "Manpower Management System — build state at session start (from docs/PROGRESS.md and docs/DECISIONS.md).",
  ...header,
  blocked.length ? "Blocked:" : "Blocked: nothing recorded.",
  ...blocked.map((b) => `  ${b}`),
  `Unanswered decisions (${open.length}): ${open.map((d) => d.replace(/^### /, "")).join("; ")}`,
  "Loop: /remember restore → /architect → build tests-first → /review → /imprint (UI) → /remember save; /recover when it breaks.",
  "Rules: CLAUDE.md. Never build on an UNANSWERED decision. Update docs/PROGRESS.md last.",
];
console.log(lines.join("\n"));
