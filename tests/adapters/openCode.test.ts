import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv, writeState } from "../../src/lib/state.js";
import { toEvent, UltraspecPlugin } from "../../adapters/opencode/plugin.js";

function mkActiveProject(phase: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-oc-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
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
  writeState(env, { workflow: "w", track: "brownfield", phase, phases_done: [], harness: "opencode", artifacts_dir: "ultraspec/workflows/w", gates: {}, session_log: [], last_handoff_at: null, last_session_id: null, last_session_at: null, nudge_marker: null, history: [] });
  return root;
}

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("opencode adapter — toEvent", () => {
  it("maps write/bash to the normalized shape", () => {
    const a = toEvent("pre", "write", { filePath: "/r/src/app.js" }, "/r", "s");
    const b = toEvent("pre", "bash", { command: "git commit -m x" }, "/r", "s");
    expect(a.event).toBe("pre_write");
    expect(a.target_path).toBe("/r/src/app.js");
    expect(b.event).toBe("pre_bash");
    expect(b.command).toBe("git commit -m x");
  });

  it("maps a post write to post_write", () => {
    const c = toEvent("post", "edit", { filePath: "/r/src/app.js" }, "/r", "s");
    expect(c.event).toBe("post_write");
    expect(c.target_path).toBe("/r/src/app.js");
  });

  it("maps an unrelated tool to ignore", () => {
    const d = toEvent("pre", "read", { filePath: "/r/src/app.js" }, "/r", "s");
    expect(d.event).toBe("ignore");
  });
});

describe("opencode adapter — UltraspecPlugin tool.execute.before (gate)", () => {
  it("denies a src/ write during spec (deny -> throws)", async () => {
    root = mkActiveProject("spec");
    const plugin = await UltraspecPlugin({ directory: root });
    await expect(
      plugin["tool.execute.before"](
        { tool: "write", sessionID: "s" },
        { args: { filePath: `${root}/src/app.js` } },
      ),
    ).rejects.toThrow(/ultraspec/);
  });

  it("allows a src/ write during build", async () => {
    root = mkActiveProject("build");
    const plugin = await UltraspecPlugin({ directory: root });
    await expect(
      plugin["tool.execute.before"](
        { tool: "write", sessionID: "s" },
        { args: { filePath: `${root}/src/app.js` } },
      ),
    ).resolves.toBeUndefined();
  });
});

describe("opencode adapter — UltraspecPlugin tool.execute.after (nudge)", () => {
  it("never throws, even when artifacts are missing", async () => {
    root = mkActiveProject("build");
    const plugin = await UltraspecPlugin({ directory: root });
    await expect(
      plugin["tool.execute.after"]({
        tool: "write",
        sessionID: "s",
        args: { filePath: `${root}/src/app.js` },
      }),
    ).resolves.not.toThrow();
  });
});
