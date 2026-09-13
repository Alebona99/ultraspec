import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runInit } from "../src/init.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let target: string;
afterEach(() => { if (target) fs.rmSync(target, { recursive: true, force: true }); });

describe("runInit", () => {
  it("creates ultraspec/ with config, workflows/, handoffs/", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    expect(fs.existsSync(path.join(target, "ultraspec/us.config.json"))).toBe(true);
    expect(fs.existsSync(path.join(target, "ultraspec/workflows"))).toBe(true);
    expect(fs.existsSync(path.join(target, "ultraspec/handoffs"))).toBe(true);
  });
  it("copies workflow/*.md locally", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const files = fs.readdirSync(path.join(target, "ultraspec/workflow"));
    expect(files).toContain("build.md");
  });
  it("generates .claude/commands/ultraspec/*.md with 'us' instead of the plugin var", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const status = fs.readFileSync(path.join(target, ".claude/commands/ultraspec/status.md"), "utf8");
    expect(status).toMatch(/\bus status\b/);
    expect(status).not.toContain('bash "us"');
    expect(status).not.toContain("CLAUDE_PLUGIN_ROOT");
  });
  it("generates .claude/settings.json with the 6 hook events", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const settings = JSON.parse(fs.readFileSync(path.join(target, ".claude/settings.json"), "utf8"));
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining(["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "PreCompact"]),
    );
  });
  it("merges into an existing .claude/settings.json without dropping other hooks", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    fs.mkdirSync(path.join(target, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(target, ".claude/settings.json"), JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command: "echo altro-tool" }] }] },
    }));
    runInit(target, packageRoot);
    const settings = JSON.parse(fs.readFileSync(path.join(target, ".claude/settings.json"), "utf8"));
    const stopCommands = settings.hooks.Stop.flatMap((h: any) => h.hooks.map((x: any) => x.command));
    expect(stopCommands).toEqual(expect.arrayContaining([expect.stringContaining("echo altro-tool"), expect.stringContaining("us hook claude-code stop")]));
  });
  it("is idempotent: running twice does not duplicate hook entries", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    runInit(target, packageRoot);
    const settings = JSON.parse(fs.readFileSync(path.join(target, ".claude/settings.json"), "utf8"));
    const stopCommands = settings.hooks.Stop.flatMap((h: any) => h.hooks.map((x: any) => x.command));
    expect(stopCommands.filter((c: string) => c.includes("stop")).length).toBe(1);
  });

  it("installs pre-commit hook into .git/hooks when target is a git repo", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    // Initialize a git repo in target
    execFileSync("git", ["init"], { cwd: target });
    runInit(target, packageRoot);
    const preCommitPath = path.join(target, ".git/hooks/pre-commit");
    expect(fs.existsSync(preCommitPath)).toBe(true);
    const content = fs.readFileSync(preCommitPath, "utf8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("does not throw when target is not a git repo", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    // Don't initialize a git repo; just call runInit
    expect(() => runInit(target, packageRoot)).not.toThrow();
  });

  it("the installed pre-commit hook genuinely blocks in a denied phase and allows in an allowed phase", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    execFileSync("git", ["init"], { cwd: target });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: target });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: target });
    runInit(target, packageRoot);
    const preCommitPath = path.join(target, ".git/hooks/pre-commit");
    expect(fs.existsSync(preCommitPath)).toBe(true);

    const statePath = path.join(target, "ultraspec/.us-state.json");
    const denied = {
      workflow: "demo", track: "greenfield", phase: "intake", phases_done: [],
      harness: null, artifacts_dir: "ultraspec/workflows/demo", gates: {},
      session_log: [], last_handoff_at: null, last_session_id: null,
      last_session_at: null, nudge_marker: null, history: [],
    };
    fs.writeFileSync(statePath, JSON.stringify(denied));

    fs.writeFileSync(path.join(target, "a.txt"), "x");
    execFileSync("git", ["add", "a.txt"], { cwd: target });
    // intake is not in commit_allowed_phases (build/review/archive) -> the hook must block
    expect(() => execFileSync(preCommitPath, [], { cwd: target })).toThrow();

    const allowed = { ...denied, phase: "build" };
    fs.writeFileSync(statePath, JSON.stringify(allowed));
    // build IS in commit_allowed_phases -> the hook must allow (exit 0, no throw)
    expect(() => execFileSync(preCommitPath, [], { cwd: target })).not.toThrow();
  });

  it("records packageVersion in .manifest.json entries", () => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), "us-init-"));
    runInit(target, packageRoot);
    const manifest = JSON.parse(fs.readFileSync(path.join(target, "ultraspec/.manifest.json"), "utf8"));
    for (const [key, entry] of Object.entries(manifest)) {
      if (key.startsWith("workflow/")) {
        expect((entry as any).packageVersion).toBe("0.1.0");
      }
    }
  });
});
