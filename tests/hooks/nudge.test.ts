import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { decide as nudgeDecide } from "../../src/hooks/nudge.js";
import type { NormalizedEvent } from "../../src/types.js";

let root: string;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event: "post_write",
    harness: "claude-code",
    cwd: root,
    session_id: "s123",
    target_path: null,
    command: null,
    reason: null,
    raw: {},
    ...partial,
  };
}

function mkconfig(): string {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
  const usDir = path.join(root, "ultraspec");
  fs.mkdirSync(usDir, { recursive: true });

  const config = {
    state_file: "ultraspec/.us-state.json",
    workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs",
    memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive"],
    code_edit_allowed_from: "build",
    commit_allowed_phases: ["archive"],
    stop_gated_phases: ["spec", "plan"],
    protected_always_globs: ["ultraspec/**", ".claude/**"],
    protected_globs: ["src/**"],
    always_allowed_globs: ["*.md", "tests/**"],
    phase_commands: {},
    gates: {
      spec: { requires: ["spec.md"], requires_approval: true },
    },
    agent_instructions: "",
    memory: { enabled: false },
    handoff: { nudge_threshold: 15 },
  };
  fs.writeFileSync(path.join(usDir, "us.config.json"), JSON.stringify(config));

  return root;
}

function mkstate(phase: string): string {
  const root = mkconfig();
  const usDir = path.join(root, "ultraspec");

  const state = {
    workflow: "w",
    track: "brownfield" as const,
    phase,
    phases_done: ["intake", "discover"],
    openspec_change: "w",
    harness: "claude-code",
    artifacts_dir: "ultraspec/workflows/w",
    gates: { spec: { requires: ["spec.md"], requires_approval: true, human_approved: false } },
    session_log: [],
    last_handoff_at: null,
    last_session_id: null,
    last_session_at: null,
    nudge_marker: null,
    history: [],
    updated_at: "2026-01-01T00:00:00Z",
  };
  fs.writeFileSync(path.join(usDir, ".us-state.json"), JSON.stringify(state));

  return root;
}

describe("nudge.decide — fail-open", () => {
  it("no ultraspec root -> allow", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    expect(nudgeDecide(root, ev()).decision).toBe("allow");
  });

  it("no active workflow (valid config, no state file) -> allow", () => {
    const r = mkconfig();
    expect(nudgeDecide(r, ev()).decision).toBe("allow");
  });
});

describe("nudge.decide — with active workflow", () => {
  it("post_write logs session and returns allow if artifacts complete", () => {
    const r = mkstate("spec");
    // Create the required artifact
    const artifactsDir = path.join(r, "ultraspec/workflows/w");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "spec.md"), "# Spec");

    const result = nudgeDecide(r, ev({ target_path: path.join(r, "src/app.ts") }));
    expect(result.decision).toBe("allow");

    // Verify session was logged
    const state = JSON.parse(fs.readFileSync(path.join(r, "ultraspec/.us-state.json"), "utf8"));
    expect(state.session_log.length).toBeGreaterThan(0);
    const lastLog = state.session_log[state.session_log.length - 1];
    expect(lastLog.event).toBe("post_write");
  });

  it("post_write nudges if artifacts missing", () => {
    const r = mkstate("spec");
    const result = nudgeDecide(r, ev({ target_path: path.join(r, "src/app.ts") }));
    expect(result.decision).toBe("nudge");
    expect(result.context).toContain("spec.md");
  });

  it("post_write logs session with target path", () => {
    const r = mkstate("build");
    const targetPath = path.join(r, "src/component.tsx");
    nudgeDecide(r, ev({ target_path: targetPath }));

    const state = JSON.parse(fs.readFileSync(path.join(r, "ultraspec/.us-state.json"), "utf8"));
    expect(state.session_log.length).toBeGreaterThan(0);
    const lastLog = state.session_log[state.session_log.length - 1];
    expect(lastLog.note).toContain("src/component.tsx");
  });

  it("post_write without target_path logs '?'", () => {
    const r = mkstate("build");
    nudgeDecide(r, ev({ target_path: null }));

    const state = JSON.parse(fs.readFileSync(path.join(r, "ultraspec/.us-state.json"), "utf8"));
    expect(state.session_log.length).toBeGreaterThan(0);
    const lastLog = state.session_log[state.session_log.length - 1];
    expect(lastLog.note).toContain("?");
  });
});
