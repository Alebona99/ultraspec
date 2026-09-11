// End-to-end workflow-lifecycle simulation, porting tests/test_e2e.sh.
//
// Drives the state machine directly through the already-tested cmdX functions
// from src/commands/*.ts (not main() from src/cli.ts) so assertions can be made
// on real return values and thrown Error messages instead of parsing stdout/rc
// through console spies. Drives gate/banner/stop decisions through
// handleClaudeCodeHook from src/adapters/claudeCode.ts, exactly as the real
// Claude Code hooks.json wires them up — that's the "real end-to-end" half.
//
// Every workflow runs against a real temp directory with a real
// ultraspec/us.config.json (copied verbatim from the package root, not a
// hand-trimmed stub) and real file I/O — no mocks.
import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { resolveEnv, readState } from "../src/lib/state.js";
import { cmdStart } from "../src/commands/start.js";
import { cmdAdvance } from "../src/commands/advance.js";
import { cmdApprove } from "../src/commands/approve.js";
import { cmdHandoffPath, cmdHandoffDone } from "../src/commands/handoff.js";
import { handleClaudeCodeHook } from "../src/adapters/claudeCode.js";
import type { UsEnv } from "../src/types.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true }); });

function mkProjectRoot(): UsEnv {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-e2e-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.copyFileSync(
    path.join(packageRoot, "us.config.json"),
    path.join(root, "ultraspec", "us.config.json"),
  );
  return resolveEnv(root)!;
}

function phase(env: UsEnv): string {
  return readState(env).state!.phase;
}

function touch(env: UsEnv, workflow: string, file: string): void {
  const dir = path.join(env.root, "ultraspec", "workflows", workflow);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), "");
}

function ccWrite(root: string, relPath: string) {
  return {
    session_id: "s1", cwd: root, hook_event_name: "PreToolUse", tool_name: "Write",
    tool_input: { file_path: path.join(root, relPath) },
  };
}

function ccCommit(root: string) {
  return {
    session_id: "s1", cwd: root, hook_event_name: "PreToolUse", tool_name: "Bash",
    tool_input: { command: 'git commit -m "wip"' },
  };
}

function ccStop(root: string) {
  return { session_id: "s1", cwd: root, hook_event_name: "Stop", last_assistant_message: "done" };
}

function gateSrc(root: string): number {
  return handleClaudeCodeHook("gate", root, ccWrite(root, "src/app.js")).exitCode;
}
function gateWorkflowFile(root: string, workflow: string, file: string): number {
  return handleClaudeCodeHook("gate", root, ccWrite(root, `ultraspec/workflows/${workflow}/${file}`)).exitCode;
}
function gateCommit(root: string): number {
  return handleClaudeCodeHook("gate", root, ccCommit(root)).exitCode;
}
function stop(root: string): number {
  return handleClaudeCodeHook("stop", root, ccStop(root)).exitCode;
}

describe("e2e: full workflow lifecycle (start -> ... -> done)", () => {
  it("drives every phase transition and gate decision through to done", () => {
    const env = mkProjectRoot();
    const wf = "demo";

    // start --track brownfield -> phase intake
    cmdStart(env, [wf, "--track", "brownfield", "--harness", "claude-code"]);
    expect(phase(env)).toBe("intake");

    // INTAKE/DISCOVER/SPEC/PLAN: writing src/ is denied
    touch(env, wf, "discovery.md");
    cmdAdvance(env, []); // intake -> discover (no gate on intake)
    expect(phase(env)).toBe("discover");
    expect(gateSrc(env.root)).toBe(2);

    // discover -> spec (discovery.md already present)
    cmdAdvance(env, []);
    expect(phase(env)).toBe("spec");
    expect(gateSrc(env.root)).toBe(2);
    expect(gateWorkflowFile(env.root, wf, "spec.md")).toBe(0); // planning artifacts always OK

    // SPEC gate: advance blocked without artifacts, then without approval, then OK
    expect(() => cmdAdvance(env, [])).toThrow(/mancano gli artefatti/);
    expect(phase(env)).toBe("spec");
    touch(env, wf, "spec.md");
    expect(() => cmdAdvance(env, [])).toThrow(/richiede l'approvazione/);
    expect(phase(env)).toBe("spec");
    cmdApprove(env, ["spec"]);
    cmdAdvance(env, []);
    expect(phase(env)).toBe("plan");

    // PLAN: still denies src/ writes and commits
    expect(gateSrc(env.root)).toBe(2);
    expect(gateCommit(env.root)).toBe(2);

    // PLAN gate: plan.md + approval -> build
    expect(() => cmdAdvance(env, [])).toThrow(/mancano gli artefatti/);
    touch(env, wf, "plan.md");
    expect(() => cmdAdvance(env, [])).toThrow(/richiede l'approvazione/);
    expect(phase(env)).toBe("plan");
    cmdApprove(env, ["plan"]);
    cmdAdvance(env, []);
    expect(phase(env)).toBe("build");

    // BUILD: src/ writes and commits are finally allowed
    expect(gateSrc(env.root)).toBe(0);
    expect(gateCommit(env.root)).toBe(0);

    // BUILD -> REVIEW; stop is held until review.md exists
    cmdAdvance(env, []);
    expect(phase(env)).toBe("review");
    expect(stop(env.root)).toBe(2); // blocked: no review.md
    touch(env, wf, "review.md");
    expect(stop(env.root)).toBe(0);

    // REVIEW -> ARCHIVE -> DONE
    cmdApprove(env, ["review"]);
    cmdAdvance(env, []);
    expect(phase(env)).toBe("archive");
    touch(env, wf, "summary.md");
    cmdApprove(env, ["archive"]);
    cmdAdvance(env, []);
    expect(phase(env)).toBe("done");

    // done is final: no further phase to advance to
    expect(() => cmdAdvance(env, [])).toThrow(/già alla fase finale/);

    // history recorded every transition + approval + start
    const events = readState(env).state!.history.map((h) => h.event);
    expect(events).toContain("start");
    expect(events).toContain("approve");
    expect(events).toContain("advance");
  });
});

describe("e2e: resume across two sessions via the handoff mechanism", () => {
  it("session 2 sees the handoff written by session 1", () => {
    const env = mkProjectRoot();
    const wf = "w";

    cmdStart(env, [wf, "--track", "greenfield", "--harness", "claude-code"]);
    touch(env, wf, "discovery.md");
    cmdAdvance(env, []); // intake -> discover
    cmdAdvance(env, []); // discover -> spec
    expect(phase(env)).toBe("spec");

    // session 1: banner runs (stamps last_session_at), work happens, handoff written
    const session1 = handleClaudeCodeHook("banner", env.root, {
      session_id: "s1", cwd: env.root, hook_event_name: "SessionStart",
    });
    expect(session1.exitCode).toBe(0);
    const session1At = readState(env).state!.last_session_at;
    expect(session1At).toBeTruthy();

    const hp = cmdHandoffPath(env, []).trim();
    fs.mkdirSync(path.dirname(hp), { recursive: true });
    fs.writeFileSync(hp, "# Handoff w\nProssima azione: scrivere spec.md, poi /ultraspec:approve spec\n");
    // Give the handoff file an mtime that is unambiguously after last_session_at,
    // rather than sleeping in real time (see recentHandoffBlob in src/lib/context.ts).
    const after = new Date(Date.parse(session1At!) + 5000);
    fs.utimesSync(hp, after, after);
    cmdHandoffDone(env, [hp]);

    // session 2 starts
    const session2 = handleClaudeCodeHook("banner", env.root, {
      session_id: "s2", cwd: env.root, hook_event_name: "SessionStart",
    });
    expect(session2.exitCode).toBe(0);
    const ctx = JSON.parse(session2.stdout).hookSpecificOutput.additionalContext as string;
    expect(ctx).toContain("Handoff dalla sessione precedente");
    expect(ctx).toContain("scrivere spec.md");
    expect(ctx).toContain("phase=spec");
  });
});
