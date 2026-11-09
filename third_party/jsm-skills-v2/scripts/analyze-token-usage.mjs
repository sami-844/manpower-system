#!/usr/bin/env node
// Token-usage analyzer for a Claude Code session transcript.
//
// Answers "where did the tokens go in this run?" — the number the skills care
// about most. It separates main-thread cost from subagent (sidechain) cost,
// splits raw tokens into fresh input / cache-write / cache-read / output, and
// prints an approximate BILLED-EQUIVALENT so you can see how much of a scary
// resident number (e.g. an 80k architect run) is actually cheap cache reads.
//
// Usage:
//   node scripts/analyze-token-usage.mjs                # newest session for THIS project
//   node scripts/analyze-token-usage.mjs <file.jsonl>   # a specific transcript
//   node scripts/analyze-token-usage.mjs --top 15       # show the 15 heaviest turns
//   node scripts/analyze-token-usage.mjs --project <encoded-dir-name>
//
// It reads Claude Code's own session files under
//   ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
// and writes nothing. Read-only, zero dependencies.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Approximate cost weights RELATIVE to one uncached input token (= 1.0).
// These are the standard Anthropic cache/output multipliers; they are here to
// turn raw token counts into a single comparable "cost unit", not to quote a
// dollar price (that depends on the model tier you ran on). Output dominates.
const W = { input: 1.0, cacheWrite: 1.25, cacheRead: 0.1, output: 5.0 };

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const TOP = Number(flag('--top', '12'));
const projectOverride = flag('--project', null);

function encodedCwd() {
  // Claude Code encodes the cwd by replacing every "/" with "-".
  return process.cwd().replace(/\//g, '-');
}

function resolveTranscript() {
  const positional = args.find(a => !a.startsWith('--') && a.endsWith('.jsonl'));
  if (positional) return positional;
  const dir = join(homedir(), '.claude', 'projects', projectOverride || encodedCwd());
  if (!existsSync(dir)) {
    console.error(`No session directory found at ${dir}\nPass a .jsonl path explicitly, or --project <encoded-dir-name>.`);
    process.exit(1);
  }
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!files.length) {
    console.error(`No .jsonl transcripts in ${dir}`);
    process.exit(1);
  }
  return files[0].f;
}

function blank() {
  return { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, turns: 0, webSearch: 0, webFetch: 0 };
}
function addUsage(acc, u) {
  if (!u) return;
  acc.input += u.input_tokens || 0;
  acc.cacheWrite += u.cache_creation_input_tokens || 0;
  acc.cacheRead += u.cache_read_input_tokens || 0;
  acc.output += u.output_tokens || 0;
  acc.turns += 1;
  const st = u.server_tool_use || {};
  acc.webSearch += st.web_search_requests || 0;
  acc.webFetch += st.web_fetch_requests || 0;
}
function costUnits(a) {
  return Math.round(a.input * W.input + a.cacheWrite * W.cacheWrite + a.cacheRead * W.cacheRead + a.output * W.output);
}
function rawTotal(a) {
  return a.input + a.cacheWrite + a.cacheRead + a.output;
}
const k = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n));

const file = resolveTranscript();
const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);

const main = blank();
const sub = blank();
const spawns = [];   // Agent/Task tool_use calls
const turns = [];    // per assistant turn, for the "heaviest turns" report
const seen = new Set(); // dedupe: Claude Code logs some assistant events twice

for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { continue; }
  const content = e.message && e.message.content;
  const tools = [];
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c.type === 'tool_use') {
        tools.push(c.name);
        if (c.name === 'Agent' || c.name === 'Task') {
          spawns.push({ type: (c.input && (c.input.subagent_type || 'subagent')), desc: (c.input && c.input.description) || '' });
        }
      }
    }
  }
  if (e.type !== 'assistant' || !e.message || !e.message.usage) continue;
  // One API response can appear as several streamed rows sharing a requestId;
  // count its usage once.
  const dedupeKey = e.requestId || e.uuid;
  if (dedupeKey && seen.has(dedupeKey)) continue;
  if (dedupeKey) seen.add(dedupeKey);
  const u = e.message.usage;
  const bucket = e.isSidechain ? sub : main;
  addUsage(bucket, u);
  turns.push({
    sidechain: !!e.isSidechain,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    input: u.input_tokens || 0,
    tools,
  });
}

const all = blank();
for (const key of Object.keys(all)) all[key] = main[key] + sub[key];

function row(label, a) {
  const parts = [
    `fresh ${k(a.input).padStart(6)}`,
    `cache-write ${k(a.cacheWrite).padStart(6)}`,
    `cache-read ${k(a.cacheRead).padStart(7)}`,
    `output ${k(a.output).padStart(6)}`,
  ];
  return `  ${label.padEnd(16)} ${parts.join(' · ')}\n` +
         `  ${''.padEnd(16)} raw ${k(rawTotal(a))}  ·  cost-units ${k(costUnits(a))}  ·  ${a.turns} turns`;
}

console.log(`\nTranscript: ${file}`);
console.log(`Events: ${lines.length}  ·  assistant turns: ${all.turns} (main ${main.turns}, subagent ${sub.turns})\n`);

console.log('TOKENS BY THREAD');
console.log(row('main thread', main));
console.log(row('subagents', sub));
console.log(row('TOTAL', all));

const rawT = rawTotal(all) || 1;
const cacheReadPct = Math.round((all.cacheRead / rawT) * 100);
const outCostPct = Math.round((all.output * W.output / (costUnits(all) || 1)) * 100);
console.log(`\nREAD ME: ${cacheReadPct}% of raw tokens are cache reads (billed ~10% of a fresh token),`);
console.log(`so the raw total overstates real cost. In cost-units, output generation is ~${outCostPct}% of the bill.`);
console.log(`Lever ranking follows cost-units, not raw resident size: cut OUTPUT and FRESH input first,`);
console.log(`cache reads are already cheap. Fewer interview rounds cuts output; smaller resident files cut cache-read only.`);

if (all.webSearch || all.webFetch) {
  console.log(`\nWEB: ${all.webSearch} searches · ${all.webFetch} fetches (subagent web work rides back as a summary).`);
}

if (spawns.length) {
  console.log(`\nSUBAGENTS SPAWNED (${spawns.length}):`);
  for (const s of spawns) console.log(`  - ${s.type}: ${s.desc}`);
  if (sub.turns === 0) {
    console.log('  (async subagents log to their own transcript files, so their tokens are not in');
    console.log('   this total; inline read-only helpers that run as sidechains would appear above.)');
  }
}

const heaviest = turns.sort((a, b) => b.output - a.output).slice(0, TOP);
console.log(`\nHEAVIEST ${heaviest.length} TURNS (by output tokens — the real cost driver):`);
for (const t of heaviest) {
  const where = t.sidechain ? 'sub ' : 'main';
  const tools = t.tools.length ? `[${[...new Set(t.tools)].join(',')}]` : '';
  console.log(`  ${where}  out ${k(t.output).padStart(6)}  cache-read ${k(t.cacheRead).padStart(7)}  ${tools}`);
}
console.log('');
