import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { emit, pathMatchesAny, decidePreWrite, decidePreBash } from "../../src/lib/decision.js";
import type { UsConfig, UsEnv, UsState } from "../../src/types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shippedConfig: UsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "us.config.json"), "utf8")
);

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

  // Edge case 1: Literal dot escaping
  it("literal dot: *.md does not match xmd", () => expect(pathMatchesAny("xmd", ["*.md"])).toBe(false));
  it("literal dot: *.md matches test.md", () => expect(pathMatchesAny("test.md", ["*.md"])).toBe(true));

  // Edge case 2: ? matches exactly one non-/ character
  it("? matches one char: a?.ts matches ab.ts", () => expect(pathMatchesAny("ab.ts", ["a?.ts"])).toBe(true));
  it("? requires exactly one: a?.ts does not match a.ts", () => expect(pathMatchesAny("a.ts", ["a?.ts"])).toBe(false));
  it("? requires exactly one: a?.ts does not match abc.ts", () => expect(pathMatchesAny("abc.ts", ["a?.ts"])).toBe(false));

  // Edge case 3: Full-path anchoring
  it("anchoring: src/*.ts does not match other/src/x.ts", () => expect(pathMatchesAny("other/src/x.ts", ["src/*.ts"])).toBe(false));
  it("anchoring: src/*.ts does not match src/x.ts.bak", () => expect(pathMatchesAny("src/x.ts.bak", ["src/*.ts"])).toBe(false));
  it("anchoring: src/*.ts matches src/x.ts", () => expect(pathMatchesAny("src/x.ts", ["src/*.ts"])).toBe(true));

  // Edge case 4: Regex metacharacter neutralization
  it("metachar +: a+b.ts matches literal a+b.ts", () => expect(pathMatchesAny("a+b.ts", ["a+b.ts"])).toBe(true));
  it("metachar +: a+b.ts does not match abb.ts", () => expect(pathMatchesAny("abb.ts", ["a+b.ts"])).toBe(false));
  it("metachar (: func(x).ts matches literal func(x).ts", () => expect(pathMatchesAny("func(x).ts", ["func(x).ts"])).toBe(true));
  it("metachar ): foo).ts matches literal foo).ts", () => expect(pathMatchesAny("foo).ts", ["foo).ts"])).toBe(true));
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

describe("decidePreWrite with the actual shipped us.config.json", () => {
  const shippedEnv: UsEnv = {
    root: "/repo", dir: "/repo/ultraspec",
    configPath: "/repo/ultraspec/us.config.json", stateFile: "/repo/ultraspec/.us-state.json",
    config: shippedConfig,
  };
  const phases = shippedConfig.phase_order;

  it("generated slash commands (.claude/commands/ultraspec/**) are denied in every phase", () => {
    for (const phase of phases) {
      const d = decidePreWrite(shippedEnv, mkState(phase), ".claude/commands/ultraspec/status.md");
      expect(d.decision, `phase ${phase}`).toBe("deny");
    }
  });

  it(".claude/settings.json is denied in every phase", () => {
    for (const phase of phases) {
      const d = decidePreWrite(shippedEnv, mkState(phase), ".claude/settings.json");
      expect(d.decision, `phase ${phase}`).toBe("deny");
    }
  });

  it("protected_always_globs wins even though always_allowed_globs has **/*.md", () => {
    expect(shippedConfig.always_allowed_globs).toContain("**/*.md");
    const d = decidePreWrite(shippedEnv, mkState("build"), ".claude/commands/ultraspec/status.md");
    expect(d.decision).toBe("deny");
  });
});
