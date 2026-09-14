import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv, writeState } from "../../src/lib/state.js";
import { handleClaudeCodeHook } from "../../src/adapters/claudeCode.js";

function mkActiveProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-cc-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: [], protected_always_globs: [], protected_globs: ["src/**"],
    always_allowed_globs: [], phase_commands: {}, gates: {}, agent_instructions: "auto",
    memory: { enabled: false }, handoff: { nudge_threshold: 15 },
  }));
  const env = resolveEnv(root)!;
  writeState(env, { workflow: "w", track: "greenfield", phase: "intake", phases_done: [], harness: "claude-code", artifacts_dir: "ultraspec/workflows/w", gates: {}, session_log: [], last_handoff_at: null, last_session_id: null, last_session_at: null, nudge_marker: null, history: [] });
  return root;
}

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("handleClaudeCodeHook — gate", () => {
  it("deny -> exit 2, reason on stderr", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("gate", root, {
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: `${root}/src/a.ts` }, cwd: root,
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("BLOCCATO");
  });
  it("allow -> exit 0, no output", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("gate", root, {
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: `${root}/README.md` }, cwd: root,
    });
    expect(r.exitCode).toBe(0);
  });
});

describe("handleClaudeCodeHook — banner", () => {
  it("session_start event -> exit 0, JSON with SessionStart and non-empty context", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("banner", root, {
      hook_event_name: "SessionStart", cwd: root,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
    const json = JSON.parse(r.stdout);
    expect(json.hookSpecificOutput.hookEventName).toBe("SessionStart");
    expect(json.hookSpecificOutput.additionalContext).toBeTruthy();
    expect(json.hookSpecificOutput.additionalContext).toContain("workflow=w");
  });
  it("user_prompt event -> exit 0, JSON with UserPromptSubmit", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("banner", root, {
      hook_event_name: "UserPromptSubmit", cwd: root,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
    const json = JSON.parse(r.stdout);
    expect(json.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(json.hookSpecificOutput.additionalContext).toBeTruthy();
    expect(json.hookSpecificOutput.additionalContext).toContain("workflow=w");
  });
});

describe("handleClaudeCodeHook — stop", () => {
  it("stop event in gated phase with missing artifacts -> exit 2, reason on stderr", () => {
    root = mkActiveProject();
    // Modify config to gate the current phase
    const configPath = path.join(root, "ultraspec", "us.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.stop_gated_phases = ["intake"];
    config.gates.intake = { requires: ["spec.md"], requires_approval: false };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const r = handleClaudeCodeHook("stop", root, {
      hook_event_name: "Stop", cwd: root,
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain("non completata");
    expect(r.stderr).toContain("spec.md");
  });
  it("stop event in non-gated phase -> exit 0", () => {
    root = mkActiveProject();
    const r = handleClaudeCodeHook("stop", root, {
      hook_event_name: "Stop", cwd: root,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });
  it("stop event in gated phase with all artifacts present -> exit 0", () => {
    root = mkActiveProject();
    // Modify config to gate the current phase
    const configPath = path.join(root, "ultraspec", "us.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.stop_gated_phases = ["intake"];
    config.gates.intake = { requires: ["spec.md"], requires_approval: false };
    fs.writeFileSync(configPath, JSON.stringify(config));

    // Create the required artifact
    const artifactsDir = path.join(root, "ultraspec", "workflows", "w");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "spec.md"), "# Spec");

    const r = handleClaudeCodeHook("stop", root, {
      hook_event_name: "Stop", cwd: root,
    });
    expect(r.exitCode).toBe(0);
  });
});

describe("handleClaudeCodeHook — nudge", () => {
  it("post_write event with missing artifacts -> exit 0, JSON with PostToolUse and missing artifact context", () => {
    root = mkActiveProject();
    // Modify config to have gates
    const configPath = path.join(root, "ultraspec", "us.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.gates.intake = { requires: ["spec.md"], requires_approval: false };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const r = handleClaudeCodeHook("nudge", root, {
      hook_event_name: "PostToolUse", tool_name: "Write",
      tool_input: { file_path: `${root}/test.ts` }, cwd: root,
    });
    expect(r.exitCode).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(json.hookSpecificOutput.additionalContext).toContain("spec.md");
  });
  it("post_write event with no missing artifacts -> exit 0, no JSON output", () => {
    root = mkActiveProject();
    // Modify config to have gates but create all artifacts
    const configPath = path.join(root, "ultraspec", "us.config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.gates.intake = { requires: ["spec.md"], requires_approval: false };
    fs.writeFileSync(configPath, JSON.stringify(config));

    // Create the required artifact
    const artifactsDir = path.join(root, "ultraspec", "workflows", "w");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "spec.md"), "# Spec");

    const r = handleClaudeCodeHook("nudge", root, {
      hook_event_name: "PostToolUse", tool_name: "Write",
      tool_input: { file_path: `${root}/test.ts` }, cwd: root,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });
});
