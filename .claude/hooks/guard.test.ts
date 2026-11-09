import { describe, expect, test } from "bun:test";
import { check, checkGolden, type ToolCall } from "./guard";

const ROOT = "/repo";
const LOCK = `${"a".repeat(64)}  0000_init.sql\n${"b".repeat(64)}  0001_audit.sql\n`;
const files: Record<string, string> = {
  "/repo/apps/api/drizzle/migrations.lock": LOCK,
  "/repo/packages/core/golden/eos.json": JSON.stringify({
    cases: [{ id: "eos-1", input: { years: 3 }, expected: "450.000", signedBy: "Payroll officer", signedOn: "2027-01-10" }],
  }),
};
const read = (p: string) => files[p] ?? null;
const write = (file_path: string, content: string): ToolCall => ({ tool_name: "Write", tool_input: { file_path, content } });
const edit = (file_path: string, old_string: string, new_string: string): ToolCall => ({ tool_name: "Edit", tool_input: { file_path, old_string, new_string } });

describe("guard: secrets", () => {
  test("blocks .env and .env.local", () => {
    expect(check(write("/repo/.env", "X=1"), ROOT, read)).toContain("secrets");
    expect(check(write("/repo/apps/api/.env.local", "X=1"), ROOT, read)).toContain("secrets");
  });
  test("allows .env.example", () => {
    expect(check(write("/repo/.env.example", "X="), ROOT, read)).toBeNull();
  });
});

describe("guard: migrations", () => {
  test("blocks editing an applied (locked) migration", () => {
    expect(check(edit("/repo/apps/api/drizzle/0001_audit.sql", "a", "b"), ROOT, read)).toContain("applied migration");
  });
  test("allows writing the next, unlocked migration", () => {
    expect(check(write("/repo/apps/api/drizzle/0002_bank_accounts.sql", "CREATE TABLE x();"), ROOT, read)).toBeNull();
  });
  test("blocks hand edits to migrations.lock", () => {
    expect(check(edit("/repo/apps/api/drizzle/migrations.lock", "a", "b"), ROOT, read)).toContain("--update-lock");
  });
  test("resolves relative paths against cwd", () => {
    const call: ToolCall = { tool_name: "Edit", tool_input: { file_path: "drizzle/0000_init.sql", old_string: "a", new_string: "b" }, cwd: "/repo/apps/api" };
    expect(check(call, ROOT, read)).toContain("applied migration");
  });
});

describe("guard: golden cases (rule 4)", () => {
  const path = "/repo/packages/core/golden/eos.json";
  test("blocks changing a signed expected value", () => {
    expect(check(edit(path, '"expected":"450.000"', '"expected":"451.000"'), ROOT, read)).toContain("expected value changed");
  });
  test("blocks removing a case", () => {
    expect(check(write(path, JSON.stringify({ cases: [] })), ROOT, read)).toContain("removed");
  });
  test("blocks a new case with a non-null expected value", () => {
    const next = JSON.parse(files[path]);
    next.cases.push({ id: "eos-2", input: { years: 5 }, expected: "750.000" });
    expect(check(write(path, JSON.stringify(next)), ROOT, read)).toContain('"expected": null');
  });
  test("allows a new case with expected: null", () => {
    const next = JSON.parse(files[path]);
    next.cases.push({ id: "eos-2", input: { years: 5 }, expected: null });
    expect(check(write(path, JSON.stringify(next)), ROOT, read)).toBeNull();
  });
  test("blocks forging a sign-off", () => {
    expect(checkGolden(JSON.stringify([{ id: "x", expected: null }]), JSON.stringify([{ id: "x", expected: null, signedBy: "Someone" }]))).toContain("sign-off");
  });
  test("blocks invalid JSON", () => {
    expect(check(write(path, "{ not json"), ROOT, read)).toContain("valid JSON");
  });
});

describe("guard: everything else passes", () => {
  test("ordinary source files", () => {
    expect(check(write("/repo/apps/api/src/workers/workers.service.ts", "export {}"), ROOT, read)).toBeNull();
  });
  test("files outside the project", () => {
    expect(check(write("/tmp/notes.md", "x"), ROOT, read)).toBeNull();
  });
});
