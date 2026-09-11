import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { decide as bannerDecide } from "../../src/hooks/banner.js";
import type { NormalizedEvent } from "../../src/types.js";

let root: string;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event: "session_start",
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
    phase_commands: { spec: "spec", plan: "plan" },
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

describe("banner.decide — fail-open", () => {
  it("no ultraspec root -> allow, no banner", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    const result = bannerDecide(root, ev());
    expect(result.decision).toBe("allow");
    expect(result.context).toBeUndefined();
  });

  it("no active workflow -> allow, no banner", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    const result = bannerDecide(root, ev());
    expect(result.decision).toBe("allow");
    expect(result.context).toBeUndefined();
  });
});

describe("banner.decide — with active workflow", () => {
  it("session_start -> banner + state update", () => {
    const r = mkstate("spec");
    const result = bannerDecide(r, ev({ event: "session_start", session_id: "s123" }));
    expect(result.decision).toBe("allow");
    expect(result.context).toBeDefined();
    expect(result.context).toContain("[ultraspec]");
    expect(result.context).toContain("workflow=w");

    // Verify state was updated with session info
    const state = JSON.parse(fs.readFileSync(path.join(r, "ultraspec/.us-state.json"), "utf8"));
    expect(state.last_session_id).toBe("s123");
    expect(state.last_session_at).toBeDefined();
  });

  it("user_prompt -> banner (short) + no state update", () => {
    const r = mkstate("spec");
    const result = bannerDecide(r, ev({ event: "user_prompt" }));
    expect(result.decision).toBe("allow");
    expect(result.context).toBeDefined();
    expect(result.context).toContain("[ultraspec]");

    // Verify state was NOT updated (last_session_at should be null)
    const state = JSON.parse(fs.readFileSync(path.join(r, "ultraspec/.us-state.json"), "utf8"));
    expect(state.last_session_at).toBeNull();
  });
});
