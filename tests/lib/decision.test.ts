import { describe, it, expect } from "vitest";
import { emit, pathMatchesAny, decidePreWrite, decidePreBash } from "../../src/lib/decision.js";
import type { UsConfig, UsEnv, UsState } from "../../src/types.js";

function mkEnv(overrides: Partial<UsConfig> = {}): UsEnv {
  const config: UsConfig = {
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: ["review"],
    protected_always_globs: ["**/.us-state.json", "ultraspec/us.config.json", "ultraspec/hooks/**"],
    protected_globs: ["src/**", "app/**"],
    always_allowed_globs: ["ultraspec/**", "docs/**", "**/*.md"],
    phase_commands: {}, gates: {}, agent_instructions: "auto",
    memory: { enabled: false }, handoff: { nudge_threshold: 15 },
    ...overrides,
  };
  return { root: "/repo", dir: "/repo/ultraspec", configPath: "/repo/ultraspec/us.config.json", stateFile: "/repo/ultraspec/.us-state.json", config };
}
function mkState(phase: string): UsState {
  return { workflow: "w", track: "greenfield", phase, phases_done: [], harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {}, session_log: [], last_handoff_at: null, last_session_id: null, last_session_at: null, nudge_marker: null, history: [] };
}

describe("emit", () => {
  it("bare allow", () => expect(emit("allow")).toEqual({ decision: "allow" }));
  it("deny with reason", () => expect(emit("deny", "no")).toEqual({ decision: "deny", reason: "no" }));
});

describe("pathMatchesAny (glob)", () => {
  it("** matches any depth", () => expect(pathMatchesAny("ultraspec/hooks/gate.sh", ["ultraspec/hooks/**"])).toBe(true));
  it("* does not cross /", () => expect(pathMatchesAny("a/b/c.ts", ["a/*.ts"])).toBe(false));
  it("no match", () => expect(pathMatchesAny("x/y.ts", ["src/**"])).toBe(false));
});

describe("decidePreWrite", () => {
  const env = mkEnv();
  it("protected_always_globs wins even in build", () => {
    const d = decidePreWrite(env, mkState("build"), "ultraspec/us.config.json");
    expect(d.decision).toBe("deny");
  });
  it("always_allowed_globs -> allow regardless of phase", () => {
    const d = decidePreWrite(env, mkState("intake"), "docs/x.md");
    expect(d.decision).toBe("allow");
  });
  it("not a protected path -> allow", () => {
    const d = decidePreWrite(env, mkState("intake"), "README.md");
    expect(d.decision).toBe("allow");
  });
  it("protected path before code_edit_allowed_from -> deny", () => {
    const d = decidePreWrite(env, mkState("plan"), "src/x.ts");
    expect(d.decision).toBe("deny");
  });
  it("protected path at/after code_edit_allowed_from -> allow", () => {
    const d = decidePreWrite(env, mkState("build"), "src/x.ts");
    expect(d.decision).toBe("allow");
    const d2 = decidePreWrite(env, mkState("review"), "src/x.ts");
    expect(d2.decision).toBe("allow");
  });
});

describe("decidePreBash", () => {
  const env = mkEnv();
  it("git commit outside commit_allowed_phases -> deny", () => {
    expect(decidePreBash(env, mkState("plan"), "git commit -m x").decision).toBe("deny");
  });
  it("git push inside commit_allowed_phases -> allow", () => {
    expect(decidePreBash(env, mkState("build"), "git push origin main").decision).toBe("allow");
  });
  it("non commit/push command -> allow", () => {
    expect(decidePreBash(env, mkState("intake"), "ls -la").decision).toBe("allow");
  });
});
