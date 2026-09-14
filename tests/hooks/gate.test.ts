import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { decide as gateDecide } from "../../src/hooks/gate.js";
import type { NormalizedEvent } from "../../src/types.js";

let root: string;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event: "pre_write",
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

describe("gate.decide — fail-open", () => {
  it("no ultraspec root -> allow", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    expect(gateDecide(root, ev({ target_path: "/x/src/a.ts" })).decision).toBe("allow");
  });

  it("no active workflow -> allow (fail-open)", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    expect(gateDecide(root, ev({ target_path: path.join(root, "src/app.js") })).decision).toBe(
      "allow"
    );
  });

  it("corrupt state -> allow (fail-open)", () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "us-hook-"));
    const usDir = path.join(root, "ultraspec");
    fs.mkdirSync(usDir, { recursive: true });

    // Write minimal config so root is found
    fs.writeFileSync(path.join(usDir, "us.config.json"), JSON.stringify({}));

    // Write invalid JSON state
    fs.writeFileSync(path.join(usDir, ".us-state.json"), "not json");

    expect(gateDecide(root, ev({ target_path: path.join(root, "src/app.js") })).decision).toBe(
      "allow"
    );
  });
});

describe("gate.decide — pre_write with active workflow", () => {
  it("protected_always_globs -> deny", () => {
    const r = mkstate("spec");
    expect(
      gateDecide(r, ev({ target_path: path.join(r, "ultraspec/config.json") })).decision
    ).toBe("deny");
  });

  it("always_allowed_globs -> allow", () => {
    const r = mkstate("spec");
    expect(gateDecide(r, ev({ target_path: path.join(r, "README.md") })).decision).toBe("allow");
  });

  it("protected_globs in code_edit_allowed phase -> allow", () => {
    const r = mkstate("build");
    expect(gateDecide(r, ev({ target_path: path.join(r, "src/app.ts") })).decision).toBe("allow");
  });

  it("protected_globs in disallowed phase -> deny", () => {
    const r = mkstate("spec");
    expect(gateDecide(r, ev({ target_path: path.join(r, "src/app.ts") })).decision).toBe("deny");
  });
});

describe("gate.decide — pre_bash with active workflow", () => {
  it("git commit in allowed phase -> allow", () => {
    const r = mkstate("archive");
    expect(gateDecide(r, ev({ event: "pre_bash", command: "git commit -m test" })).decision).toBe(
      "allow"
    );
  });

  it("git commit in disallowed phase -> deny", () => {
    const r = mkstate("spec");
    expect(gateDecide(r, ev({ event: "pre_bash", command: "git commit -m test" })).decision).toBe(
      "deny"
    );
  });

  it("non-commit command -> allow", () => {
    const r = mkstate("spec");
    expect(gateDecide(r, ev({ event: "pre_bash", command: "npm run build" })).decision).toBe(
      "allow"
    );
  });
});
