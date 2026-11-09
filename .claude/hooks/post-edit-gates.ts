#!/usr/bin/env bun
/**
 * PostToolUse: after every Edit | Write | MultiEdit, run the repository gates.
 * On failure, exit 2 so Claude sees the failures (stderr) and fixes them in the same turn.
 * The tool has already run; this cannot undo it, only report.
 */
import { join } from "node:path";

const root = process.env.CLAUDE_PROJECT_DIR ?? join(import.meta.dir, "../..");
await Bun.stdin.text(); // drain the hook payload

const proc = Bun.spawnSync(["bun", join(root, "scripts/gates.ts")], { cwd: root, stdout: "pipe", stderr: "pipe" });
if (proc.exitCode !== 0) {
  const out = `${proc.stdout.toString()}\n${proc.stderr.toString()}`.trim();
  console.error(`bun run gates failed after this edit — fix before continuing:\n${out}`);
  process.exit(2);
}
process.exit(0);
