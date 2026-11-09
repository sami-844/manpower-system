#!/usr/bin/env bun
/**
 * Repository gates — the rules in CLAUDE.md and docs/SCHEMA_GOVERNANCE.md that a
 * script can check. Run with `bun run gates`; CI runs it before the tests.
 *
 *   bun run gates                 check everything, exit 1 on any failure
 *   bun run gates --update-lock   add NEW migrations to apps/api/drizzle/migrations.lock
 *                                 (never rewrites the hash of a migration already locked)
 *
 * Each gate names the rule it enforces so a failure says what to do, not just what broke.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const MIGRATIONS = join(ROOT, "apps/api/drizzle");
const LOCK = join(MIGRATIONS, "migrations.lock");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "target", "build", "coverage", ".stryker-tmp", "reports", "test-results", "playwright-report"]);

type Failure = { gate: string; file?: string; line?: number; detail: string };
const failures: Failure[] = [];
const fail = (f: Failure) => failures.push(f);

function walk(dir: string, accept: (path: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const s = statSync(path);
    // Forward slashes on every OS, so the path patterns and allowlists below also hold on Windows.
    const posix = path.replaceAll("\\", "/");
    if (s.isDirectory()) walk(path, accept, out);
    else if (accept(posix)) out.push(posix);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).replaceAll("\\", "/");
const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const stripSqlComments = (s: string) => s.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

function scanLines(files: string[], gate: string, pattern: RegExp, detail: string, prepare: (s: string) => string = (s) => s) {
  for (const file of files) {
    const lines = prepare(readFileSync(file, "utf8")).split("\n");
    lines.forEach((text, i) => {
      if (pattern.test(text)) fail({ gate, file: rel(file), line: i + 1, detail: `${detail}: ${text.trim().slice(0, 120)}` });
    });
  }
}

const migrationFiles = () =>
  readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

// ---------------------------------------------------------------------------
// G1 Migrations — an applied migration is never edited; numbering has no gaps.
// ---------------------------------------------------------------------------
function readLock(): Map<string, string> {
  const lock = new Map<string, string>();
  if (!existsSync(LOCK)) return lock;
  for (const line of readFileSync(LOCK, "utf8").split("\n")) {
    const m = line.match(/^([0-9a-f]{64})\s+(\S+)$/);
    if (m) lock.set(m[2], m[1]);
  }
  return lock;
}

function gateMigrations(updateLock: boolean) {
  const gate = "G1 migrations locked";
  const files = migrationFiles();
  const lock = readLock();

  files.forEach((f, i) => {
    const expected = String(i).padStart(4, "0");
    if (!f.startsWith(expected)) fail({ gate, file: `apps/api/drizzle/${f}`, detail: `numbering gap or duplicate: expected ${expected}_…` });
  });

  for (const [name] of lock) {
    if (!files.includes(name)) fail({ gate, file: `apps/api/drizzle/${name}`, detail: "locked migration was deleted or renamed — never remove an applied migration" });
  }

  let added = 0;
  for (const f of files) {
    const hash = sha256(join(MIGRATIONS, f));
    const locked = lock.get(f);
    if (locked && locked !== hash) {
      fail({ gate, file: `apps/api/drizzle/${f}`, detail: "applied migration was edited — revert it and write a new numbered migration (SCHEMA_GOVERNANCE.md rule 2)" });
    } else if (!locked) {
      if (updateLock) { lock.set(f, hash); added++; }
      else fail({ gate, file: `apps/api/drizzle/${f}`, detail: "new migration is not in migrations.lock — run `bun run gates --update-lock` in the same commit" });
    }
  }

  if (updateLock) {
    const body = [...lock.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([n, h]) => `${h}  ${n}`).join("\n");
    writeFileSync(LOCK, `# SHA-256 of every migration. Never edit a line; add new ones with \`bun run gates --update-lock\`.\n${body}\n`);
    console.log(`migrations.lock: ${added} new migration(s) added, ${lock.size} total`);
  }
}

// ---------------------------------------------------------------------------
// G2 Money — never a binary float column. G3 Dates — never timestamp without tz.
// G4 Sequences — never MAX()+1 for codes.
// ---------------------------------------------------------------------------
function gateSqlTypes() {
  const files = migrationFiles().map((f) => join(MIGRATIONS, f));
  scanLines(files, "G2 money as NUMERIC", /\b(real|double\s+precision|float[48]?)\b/i, "binary float column type — money is NUMERIC(14,3)", stripSqlComments);
  scanLines(files, "G3 dates and moments", /\btimestamp(\s*\(\d\))?(\s+without\s+time\s+zone)?\b(?!\s*(\(\d\)\s*)?with\s+time\s+zone)(?!tz)/i, "timestamp without time zone — use timestamptz for moments, DATE for calendar dates", (s) =>
    stripSqlComments(s).replace(/\btimestamptz\b/gi, "").replace(/\btimestamp(\s*\(\d\))?\s+with\s+time\s+zone\b/gi, ""));
  const apiCode = walk(join(ROOT, "apps/api/src"), (p) => p.endsWith(".ts"));
  scanLines([...files, ...apiCode], "G4 codes from sequences", /max\s*\([^)]*\)\s*\+\s*1/i, "MAX()+1 races under concurrency — use a sequence (worker_code_seq) or a locked counter");
}

// ---------------------------------------------------------------------------
// G5 Lockfile — bun.lock only.
// ---------------------------------------------------------------------------
function gateLockfile() {
  const gate = "G5 bun.lock only";
  if (!existsSync(join(ROOT, "bun.lock"))) fail({ gate, detail: "bun.lock is missing" });
  const others = walk(ROOT, (p) => /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb)$/.test(p));
  for (const f of others) fail({ gate, file: rel(f), detail: "another package manager's lockfile — use bun install" });
}

// ---------------------------------------------------------------------------
// G6 Golden cases — expected values are signed by people. A golden case must carry
// either a sign-off or `expected: null`; an unsigned non-null expected is a defect.
// (Whether an AI changed a signed value is checked in review by `git diff`.)
// ---------------------------------------------------------------------------
function gateGolden() {
  const gate = "G6 golden cases signed";
  const files = walk(ROOT, (p) => /\/golden\/[^/]+\.json$/.test(p));
  for (const file of files) {
    let data: unknown;
    try { data = JSON.parse(readFileSync(file, "utf8")); }
    catch { fail({ gate, file: rel(file), detail: "not valid JSON" }); continue; }
    const cases = Array.isArray(data) ? data : (data as { cases?: unknown[] }).cases ?? [];
    (cases as Record<string, unknown>[]).forEach((c, i) => {
      if (!("expected" in c)) fail({ gate, file: rel(file), detail: `case ${c.id ?? i}: no "expected" field — use "expected": null until signed` });
      else if (c.expected !== null && !c.signedBy && !(data as { signedBy?: string }).signedBy)
        fail({ gate, file: rel(file), detail: `case ${c.id ?? i}: expected value without signedBy — only a named person sets expected values` });
    });
  }
}

// ---------------------------------------------------------------------------
// G7 Personal data — no Oman IBAN, civil-ID-like or passport-like numbers in tests,
// fixtures, seeds or docs. The seed generator produces fictional, obviously-fake data.
// ---------------------------------------------------------------------------
function gatePersonalData() {
  const gate = "G7 no real personal data";
  const files = walk(ROOT, (p) =>
    /\.(ts|tsx|json|sql|csv|md)$/.test(p) && !p.endsWith("bun.lock") && !p.includes("/docs/spec/") && !p.endsWith("scripts/gates.ts"));
  scanLines(files, gate, /\bOM\d{2}[0-9A-Z]{3}\d{16}\b/, "looks like an Oman IBAN — use the seed generator's fictional values");
}

// ---------------------------------------------------------------------------
// G8 Colours — no hard-coded colours in web source outside the token file.
// styles.css is the pre-shadcn slice (docs/ui-registry.md S2 fix list) and is
// allowlisted until S2 replaces it; the allowlist is the only escape hatch.
// ---------------------------------------------------------------------------
const COLOUR_ALLOWLIST = new Set(["apps/web/src/styles.css", "packages/ui/styles/tokens.css"]);
function gateColours() {
  const gate = "G8 colours from tokens";
  const files = walk(join(ROOT, "apps/web/src"), (p) => /\.(tsx?|css)$/.test(p))
    .concat(walk(join(ROOT, "packages/ui"), (p) => /\.(tsx?|css)$/.test(p)))
    .filter((p) => !COLOUR_ALLOWLIST.has(rel(p)) && !/\.test\.tsx?$/.test(p));
  scanLines(files, gate, /#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/, "hard-coded colour — use a Design Brief token (docs/ui-registry.md)",
    (s) => s.replace(/\/\/.*$/gm, ""));
}

// ---------------------------------------------------------------------------
const args = new Set(process.argv.slice(2));
const gates: [string, () => void][] = [
  ["G1 migrations locked", () => gateMigrations(args.has("--update-lock"))],
  ["G2–G4 SQL types and sequences", gateSqlTypes],
  ["G5 bun.lock only", gateLockfile],
  ["G6 golden cases signed", gateGolden],
  ["G7 no real personal data", gatePersonalData],
  ["G8 colours from tokens", gateColours],
];

for (const [name, run] of gates) {
  const before = failures.length;
  run();
  const n = failures.length - before;
  console.log(`${n === 0 ? "PASS" : "FAIL"}  ${name}${n ? ` (${n})` : ""}`);
}

if (failures.length) {
  console.error("\nGate failures:");
  for (const f of failures) console.error(`  [${f.gate}] ${f.file ?? ""}${f.line ? `:${f.line}` : ""}  ${f.detail}`);
  process.exit(1);
}
console.log("\nAll gates passed.");
