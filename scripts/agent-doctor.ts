#!/usr/bin/env bun
/**
 * `bun run agent:doctor` — checks that the agent setup will actually work on this machine:
 * skills load (and aren't shadowed), hooks point at real scripts, MCP servers have what they
 * need, and no upstream file can leak instructions. Exits 1 only on FAIL; WARN is advice.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
type Level = "PASS" | "WARN" | "FAIL";
const results: [Level, string][] = [];
const say = (l: Level, m: string) => results.push([l, m]);
const onPath = (bin: string) => Bun.which(bin) !== null;
const json = (p: string) => { try { return JSON.parse(readFileSync(join(ROOT, p), "utf8")); } catch (e) { say("FAIL", `${p}: not valid JSON (${(e as Error).message})`); return null; } };

// Bun
const [maj, min] = Bun.version.split(".").map(Number);
say(maj > 1 || (maj === 1 && min >= 4) ? "PASS" : "FAIL", `Bun ${Bun.version} (need ≥ 1.4)`);

// Skills
const skillsDir = join(ROOT, ".claude/skills");
const skills = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory());
for (const s of skills) {
  const f = join(skillsDir, s, "SKILL.md");
  if (!existsSync(f)) { say("FAIL", `skill ${s}: no SKILL.md`); continue; }
  const text = readFileSync(f, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  if (!/^description:/m.test(fm)) say("FAIL", `skill ${s}: front matter has no description, so it will never auto-load`);
  const lines = text.split("\n").length;
  say(lines <= 500 ? "PASS" : "WARN", `skill /${s}: ${lines} lines${lines > 500 ? " (docs advise under 500; move reference material to a supporting file)" : ""}`);
  const personal = join(homedir(), ".claude/skills", s);
  if (existsSync(personal)) say("WARN", `~/.claude/skills/${s} exists and OVERRIDES the project /${s} (personal beats project). Rename or remove the personal one to use this project's version`);
}

// Agents
const agentsDir = join(ROOT, ".claude/agents");
for (const a of existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => f.endsWith(".md")) : []) {
  const fm = readFileSync(join(agentsDir, a), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  say(/^name:/m.test(fm) && /^description:/m.test(fm) ? "PASS" : "FAIL", `agent ${a}: name and description`);
}

// Settings and hooks
const settings = json(".claude/settings.json");
if (settings) {
  say("PASS", ".claude/settings.json is valid JSON");
  for (const groups of Object.values(settings.hooks ?? {}) as { hooks: { command: string }[] }[][])
    for (const g of groups) for (const h of g.hooks) {
      const script = h.command.match(/\.claude\/hooks\/[\w.-]+/)?.[0];
      if (script) say(existsSync(join(ROOT, script)) ? "PASS" : "FAIL", `hook script ${script}`);
    }
}

// MCP servers
const mcp = json(".mcp.json");
if (mcp) {
  say("PASS", `.mcp.json is valid JSON (${Object.keys(mcp.mcpServers).length} servers)`);
  for (const [name, s] of Object.entries(mcp.mcpServers) as [string, { command?: string; type?: string; url?: string }][]) {
    if (s.url && !s.type) say("FAIL", `MCP ${name}: has url but no type (read as stdio)`);
    if (s.command && !onPath(s.command)) say("WARN", `MCP ${name}: '${s.command}' not on PATH — install it (uvx comes with uv: https://docs.astral.sh/uv/)`);
  }
  if (mcp.mcpServers.github) say(process.env.GITHUB_PAT ? "PASS" : "WARN", `MCP github: GITHUB_PAT ${process.env.GITHUB_PAT ? "set" : "not set — the server will fail to authenticate (and D10: no repository yet)"}`);
  if (mcp.mcpServers.postgres) {
    const url = process.env.MCP_DATABASE_URL ?? "postgresql://mms:mms@localhost:5432/mms_dev";
    if (/amazonaws\.com|prod/i.test(url)) say("FAIL", "MCP postgres: MCP_DATABASE_URL points at a production-looking database. The agent may only see the local seeded database (fictional data)");
    else say("PASS", `MCP postgres: read-only (restricted) on ${url.replace(/\/\/[^@]*@/, "//***@")}`);
  }
}

// Upstream isolation
for (const bad of ["CLAUDE.md", ".claude"]) {
  const hits = existsSync(join(ROOT, "third_party")) ? readdirSync(join(ROOT, "third_party")).filter((d) => existsSync(join(ROOT, "third_party", d, bad))) : [];
  say(hits.length ? "FAIL" : "PASS", hits.length ? `third_party/${hits[0]}/${bad} would load upstream instructions — rename it (see third_party/README.md)` : `third_party has no ${bad}`);
}

// State freshness
const last = readFileSync(join(ROOT, "docs/PROGRESS.md"), "utf8").match(/\*\*Last session:\*\* (\d{4}-\d{2}-\d{2})/)?.[1];
if (!last) say("FAIL", "docs/PROGRESS.md has no **Last session:** date");
else {
  const days = Math.floor((Date.now() - Date.parse(last)) / 86_400_000);
  say(days <= 7 ? "PASS" : "WARN", `docs/PROGRESS.md last updated ${last} (${days} days ago)${days > 7 ? " — run /remember save at the end of each session" : ""}`);
}

for (const [l, m] of results) console.log(`${l}  ${m}`);
const fails = results.filter(([l]) => l === "FAIL").length;
const warns = results.filter(([l]) => l === "WARN").length;
console.log(`\n${fails} fail, ${warns} warn, ${results.length - fails - warns} pass`);
process.exit(fails ? 1 : 0);
