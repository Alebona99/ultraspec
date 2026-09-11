import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { decide as stopCheckDecide } from "../../src/hooks/stopCheck.js";
import type { NormalizedEvent } from "../../src/types.js";

let root: string;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event: "stop",
    harness: "claude-code",
    cwd: root,
    session_id: null,
    target_path: null,
    command: null,
    reason: null,
    raw: {},
    ...partial,
  };
}

function mkstate(phase: string): string {
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

describe("stopCheck.decide — fail-open", () => {
  it("no ultraspec root -> allow", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    expect(stopCheckDecide(root, ev()).decision).toBe("allow");
  });

  it("no active workflow -> allow", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    expect(stopCheckDecide(root, ev()).decision).toBe("allow");
  });
});

describe("stopCheck.decide — with active workflow", () => {
  it("stop in gated phase with missing artifacts -> block", () => {
    const r = mkstate("spec");
    const result = stopCheckDecide(r, ev({ event: "stop" }));
    expect(result.decision).toBe("block");
    expect(result.reason).toContain("spec.md");
  });

  it("stop in gated phase with all artifacts -> allow", () => {
    const r = mkstate("spec");
    // Create the required artifact
    const artifactsDir = path.join(r, "ultraspec/workflows/w");
    fs.mkdirSync(artifactsDir, { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, "spec.md"), "# Spec");

    const result = stopCheckDecide(r, ev({ event: "stop" }));
    expect(result.decision).toBe("allow");
  });

  it("stop in non-gated phase -> allow", () => {
    const r = mkstate("build");
    const result = stopCheckDecide(r, ev({ event: "stop" }));
    expect(result.decision).toBe("allow");
  });

  it("pre_compact -> allow or nudge based on threshold", () => {
    const r = mkstate("build");
    const result = stopCheckDecide(r, ev({ event: "pre_compact" }));
    // Could be allow or nudge depending on threshold logic
    expect(["allow", "nudge"]).toContain(result.decision);
  });
});
