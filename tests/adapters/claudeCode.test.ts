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
