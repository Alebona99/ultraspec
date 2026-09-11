import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  findRoot, resolveEnv, readState, stateActive, writeState, patchState,
  logSession, appendHistory,
} from "../../src/lib/state.js";
import type { UsState } from "../../src/types.js";

function mkProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-state-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "ultraspec", "us.config.json"),
    JSON.stringify({
      state_file: "ultraspec/.us-state.json",
      workflows_dir: "ultraspec/workflows",
      handoffs_dir: "ultraspec/handoffs",
      memory_dir: "ultraspec/memory",
      phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
      code_edit_allowed_from: "build",
      commit_allowed_phases: ["build", "review", "archive"],
      stop_gated_phases: ["review"],
      protected_always_globs: [], protected_globs: [], always_allowed_globs: [],
      phase_commands: {}, gates: {}, agent_instructions: "auto",
      memory: { enabled: false }, handoff: { nudge_threshold: 15 },
    }),
  );
  return root;
}

const baseState: UsState = {
  workflow: "w", track: "greenfield", phase: "intake", phases_done: [],
  harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {},
  session_log: [], last_handoff_at: null, last_session_id: null,
  last_session_at: null, nudge_marker: null, history: [],
};

let root: string;
beforeEach(() => { root = mkProject(); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe("findRoot / resolveEnv", () => {
  it("finds the root from a nested cwd", () => {
    const nested = path.join(root, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    expect(findRoot(nested)).toBe(fs.realpathSync(root));
  });
  it("returns null when no ultraspec/us.config.json exists up the tree", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "us-none-"));
    expect(findRoot(other)).toBeNull();
    fs.rmSync(other, { recursive: true, force: true });
  });
  it("resolveEnv loads the config", () => {
    const env = resolveEnv(root)!;
    expect(env.config.code_edit_allowed_from).toBe("build");
  });
});

describe("readState / stateActive — fail-open", () => {
  it("no state file -> valid:false, state:null, not active", () => {
    const env = resolveEnv(root)!;
    const { valid, state } = readState(env);
    expect(valid).toBe(false);
    expect(state).toBeNull();
    expect(stateActive(env)).toBe(false);
  });
  it("corrupt (non-JSON) state -> fail-open", () => {
    const env = resolveEnv(root)!;
    fs.writeFileSync(env.stateFile, "not json");
    expect(readState(env).valid).toBe(false);
    expect(stateActive(env)).toBe(false);
  });
  it("valid state -> valid:true, active", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    const { valid, state } = readState(env);
    expect(valid).toBe(true);
    expect(state?.workflow).toBe("w");
    expect(stateActive(env)).toBe(true);
  });
});

describe("writeState / patchState", () => {
  it("writeState is atomic and refreshes updated_at", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    const raw = JSON.parse(fs.readFileSync(env.stateFile, "utf8"));
    expect(typeof raw.updated_at).toBe("string");
  });
  it("patchState mutates and persists", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    patchState(env, (s) => ({ ...s, phase: "discover" }));
    expect(readState(env).state?.phase).toBe("discover");
  });
});

describe("logSession / appendHistory", () => {
  it("logSession appends to session_log and sets last_session_id", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    logSession(env, "post_write", "scrittura: x", "sess-1");
    const s = readState(env).state!;
    expect(s.session_log).toHaveLength(1);
    expect(s.session_log[0].event).toBe("post_write");
    expect(s.last_session_id).toBe("sess-1");
  });
  it("appendHistory appends with a timestamp", () => {
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    appendHistory(env, { event: "advance", from: "intake", to: "discover" });
    const s = readState(env).state!;
    expect(s.history).toHaveLength(1);
    expect(s.history[0].event).toBe("advance");
    expect(typeof s.history[0].at).toBe("string");
  });
});
