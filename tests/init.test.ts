import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
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
    expect(status).toContain('bash "us" status');
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
});
