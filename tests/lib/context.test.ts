import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv, writeState, patchState } from "../../src/lib/state.js";
import {
  artifactsDirAbs, missingArtifacts, gateApproved, phaseBannerShort,
  phaseBanner, latestHandoff, recentHandoffBlob, sessionLogSummary,
  memoryBlob, stopDecision,
} from "../../src/lib/context.js";
import type { UsState } from "../../src/types.js";

function mkProject(gates: Record<string, any> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-ctx-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover", "spec", "plan", "build", "review", "archive", "done"],
    code_edit_allowed_from: "build", commit_allowed_phases: ["build", "review", "archive"],
    stop_gated_phases: ["review"], protected_always_globs: [], protected_globs: [],
    always_allowed_globs: [], phase_commands: { discover: "discover", spec: "spec", plan: "plan", build: "build", review: "review" },
    gates, agent_instructions: "auto", memory: { enabled: false },
    handoff: { nudge_threshold: 2 },
  }));
  return root;
}

const baseState: UsState = {
  workflow: "w", track: "greenfield", phase: "discover", phases_done: [],
  harness: null, artifacts_dir: "ultraspec/workflows/w", gates: {
    discover: { requires: ["discovery.md"], requires_approval: false, human_approved: false },
  }, session_log: [], last_handoff_at: null, last_session_id: null,
  last_session_at: null, nudge_marker: null, history: [],
};

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

describe("artifactsDirAbs", () => {
  it("resolves relative paths to absolute", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const dir = artifactsDirAbs(env, baseState);
    expect(dir).toBe(path.join(root, "ultraspec/workflows/w"));
  });
  it("returns absolute paths unchanged", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, artifacts_dir: "/tmp/absolute" };
    expect(artifactsDirAbs(env, s)).toBe("/tmp/absolute");
  });
});

describe("missingArtifacts / gateApproved", () => {
  it("reports the missing required file for the phase", () => {
    root = mkProject({ discover: { requires: ["discovery.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    expect(missingArtifacts(env, baseState, "discover")).toEqual(["discovery.md"]);
  });
  it("empty once the artifact exists on disk", () => {
    root = mkProject({ discover: { requires: ["discovery.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    fs.mkdirSync(path.join(root, "ultraspec/workflows/w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/workflows/w/discovery.md"), "x");
    expect(missingArtifacts(env, baseState, "discover")).toEqual([]);
  });
  it("gateApproved is true when requires_approval is false", () => {
    root = mkProject({ discover: { requires: [], requires_approval: false } });
    const env = resolveEnv(root)!;
    expect(gateApproved(env, baseState, "discover")).toBe(true);
  });
  it("gateApproved reflects gates.<phase>.human_approved when required", () => {
    root = mkProject({ spec: { requires: [], requires_approval: true } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec", gates: { spec: { requires: [], requires_approval: true, human_approved: false } } };
    expect(gateApproved(env, s, "spec")).toBe(false);
    expect(gateApproved(env, { ...s, gates: { spec: { ...s.gates.spec, human_approved: true } } }, "spec")).toBe(true);
  });
  it("handles multiple missing artifacts", () => {
    root = mkProject({ spec: { requires: ["spec.md", "design.md", "tests.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec", gates: { spec: { requires: ["spec.md", "design.md", "tests.md"], requires_approval: false, human_approved: false } } };
    expect(missingArtifacts(env, s, "spec")).toEqual(["spec.md", "design.md", "tests.md"]);
    fs.mkdirSync(path.join(root, "ultraspec/workflows/w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/workflows/w/spec.md"), "x");
    expect(missingArtifacts(env, s, "spec")).toEqual(["design.md", "tests.md"]);
  });
});

describe("phaseBannerShort", () => {
  it("includes workflow/track/phase and the phase command", () => {
    root = mkProject({ discover: { requires: ["discovery.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    const text = phaseBannerShort(env, baseState);
    expect(text).toContain("workflow=w");
    expect(text).toContain("track=greenfield");
    expect(text).toContain("phase=discover");
    expect(text).toContain("/ultraspec:discover");
  });
  it("banner in BUILD says code edits are allowed", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "build" };
    const text = phaseBannerShort(env, s);
    expect(text).toContain("CONSENTITE");
  });
  it("banner in SPEC says code edits are BLOCCATO", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec" };
    const text = phaseBannerShort(env, s);
    expect(text).toContain("BLOCCATO");
  });
  it("shows missing artifacts when gate requires them", () => {
    root = mkProject({ spec: { requires: ["spec.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec", gates: { spec: { requires: ["spec.md"], requires_approval: false, human_approved: false } } };
    const text = phaseBannerShort(env, s);
    expect(text).toContain("spec.md");
  });
  it("shows approval-needed once artifacts exist", () => {
    root = mkProject({ spec: { requires: ["spec.md"], requires_approval: true } });
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/workflows/w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/workflows/w/spec.md"), "x");
    const s: UsState = { ...baseState, phase: "spec", gates: { spec: { requires: ["spec.md"], requires_approval: true, human_approved: false } } };
    const text = phaseBannerShort(env, s);
    expect(text).toContain("/ultraspec:approve spec");
  });
  it("includes no phase command when not configured", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "intake" };
    const text = phaseBannerShort(env, s);
    expect(text).not.toContain("/ultraspec:");
  });
});

describe("sessionLogSummary", () => {
  it("is empty for an empty log", () => {
    expect(sessionLogSummary(baseState)).toBe("");
  });
  it("lists recent entries when non-empty", () => {
    const s: UsState = { ...baseState, session_log: [{ at: "2026-01-01T00:00:00Z", session_id: null, event: "post_write", note: "scrittura: x" }] };
    const summary = sessionLogSummary(s);
    expect(summary).toContain("post_write: scrittura: x");
  });
  it("limits to last 8 entries", () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      at: "2026-01-01T00:00:00Z", session_id: null, event: "post_write", note: `write ${i}`,
    }));
    const s: UsState = { ...baseState, session_log: entries };
    const summary = sessionLogSummary(s);
    expect(summary).toContain("write 9");
    expect(summary).toContain("write 2");
    expect(summary).not.toContain("write 1");
  });
  it("mentions no handoff written in the summary footer", () => {
    const s: UsState = { ...baseState, session_log: [{ at: "2026-01-01T00:00:00Z", session_id: null, event: "post_write", note: "x" }] };
    expect(sessionLogSummary(s)).toContain("Nessun /ultraspec:handoff");
  });
});

describe("latestHandoff", () => {
  it("returns null when no handoffs dir", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    expect(latestHandoff(env, baseState)).toBeNull();
  });
  it("returns null when handoffs dir is empty", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    expect(latestHandoff(env, baseState)).toBeNull();
  });
  it("returns the most recent handoff for the workflow", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    const p1 = path.join(root, "ultraspec/handoffs/w-old.md");
    const p2 = path.join(root, "ultraspec/handoffs/w-new.md");
    fs.writeFileSync(p1, "old");
    fs.writeFileSync(p2, "new");
    // Set older file to old time (1000 seconds from epoch)
    fs.utimesSync(p1, 1000, 1000);
    // Set newer file to recent time (2000 seconds from epoch)
    fs.utimesSync(p2, 2000, 2000);
    const latest = latestHandoff(env, baseState);
    expect(latest).toContain("w-new.md");
  });
  it("ignores handoffs for other workflows", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/handoffs/other-2026-01-01T10:00:00Z.md"), "other");
    expect(latestHandoff(env, baseState)).toBeNull();
  });
  it("ignores non-.md files", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/handoffs/w-2026-01-01T10:00:00Z.txt"), "not markdown");
    expect(latestHandoff(env, baseState)).toBeNull();
  });
});

describe("recentHandoffBlob", () => {
  it("returns empty string when no handoff exists", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const blob = recentHandoffBlob(env, baseState);
    expect(blob).toBe("");
  });
  it("includes fresh handoff when mtime is at or after last_session_at", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    const handoffPath = path.join(root, "ultraspec/handoffs/w-fresh.md");
    fs.writeFileSync(handoffPath, "# Handoff\nProssima azione: plan\n");
    // Set handoff to future time (much later than last_session_at)
    fs.utimesSync(handoffPath, 2000000000, 2000000000);

    const s: UsState = {
      ...baseState,
      last_session_at: "2020-01-01T00:00:00Z",  // old time
    };
    const blob = recentHandoffBlob(env, s);
    expect(blob).toContain("Handoff dalla sessione precedente");
    expect(blob).toContain("Prossima azione: plan");
  });
  it("prefers fresh handoff over stale handoff", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    const oldPath = path.join(root, "ultraspec/handoffs/w-2026-01-01T00:00:00Z.md");
    fs.writeFileSync(oldPath, "# Old");
    // Set to year 2020 (stale)
    fs.utimesSync(oldPath, 1577836800, 1577836800);

    const s: UsState = {
      ...baseState,
      last_session_at: "2026-01-01T09:00:00Z",
      session_log: [{ at: "2026-01-01T08:00:00Z", session_id: "s1", event: "post_write", note: "scritto" }],
    };
    const blob = recentHandoffBlob(env, s);
    // Handoff is older than last_session_at, so should fall back to session_log summary
    expect(blob).toContain("Attività recente");
    expect(blob).toContain("scritto");
  });
  it("falls back to session_log summary when no handoff", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const s: UsState = {
      ...baseState,
      session_log: [{ at: "2026-01-01T00:00:00Z", session_id: "s1", event: "post_write", note: "scritto x" }],
    };
    const blob = recentHandoffBlob(env, s);
    expect(blob).toContain("Attività recente");
    expect(blob).toContain("scritto x");
  });
  it("returns empty string when no handoff and empty session_log", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const blob = recentHandoffBlob(env, baseState);
    expect(blob).toBe("");
  });
});

describe("memoryBlob", () => {
  it("is empty when memory.enabled is false", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    expect(memoryBlob(env)).toBe("");
  });
  it("injects MEMORY.md when memory is enabled", () => {
    root = mkProject();
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "ultraspec/us.config.json"), "utf8"));
    cfg.memory.enabled = true;
    fs.writeFileSync(path.join(root, "ultraspec/us.config.json"), JSON.stringify(cfg));

    fs.mkdirSync(path.join(root, "ultraspec/memory"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/memory/MEMORY.md"), "# MEMORY\n- decisione X\n");

    const env = resolveEnv(root)!;
    const blob = memoryBlob(env);
    expect(blob).toContain("project memory");
    expect(blob).toContain("decisione X");
  });
  it("is empty when memory is enabled but MEMORY.md doesn't exist", () => {
    root = mkProject();
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "ultraspec/us.config.json"), "utf8"));
    cfg.memory.enabled = true;
    fs.writeFileSync(path.join(root, "ultraspec/us.config.json"), JSON.stringify(cfg));

    const env = resolveEnv(root)!;
    expect(memoryBlob(env)).toBe("");
  });
});

describe("phaseBanner", () => {
  it("combines short banner + continuity + memory", () => {
    root = mkProject({ spec: { requires: ["spec.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec" };
    const banner = phaseBanner(env, s);
    expect(banner).toContain("phase=spec");
    expect(banner).toContain("[ultraspec]");
  });
  it("includes handoff section when fresh handoff exists", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    const handoffPath = path.join(root, "ultraspec/handoffs/w-fresh.md");
    fs.writeFileSync(handoffPath, "# H\nX\n");
    fs.utimesSync(handoffPath, 2000000000, 2000000000);

    const s: UsState = { ...baseState, last_session_at: "2020-01-01T00:00:00Z" };
    const banner = phaseBanner(env, s);
    expect(banner).toContain("Handoff dalla sessione precedente");
  });
  it("includes memory when enabled", () => {
    root = mkProject();
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "ultraspec/us.config.json"), "utf8"));
    cfg.memory.enabled = true;
    fs.writeFileSync(path.join(root, "ultraspec/us.config.json"), JSON.stringify(cfg));

    fs.mkdirSync(path.join(root, "ultraspec/memory"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/memory/MEMORY.md"), "# M\n");

    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState };
    const banner = phaseBanner(env, s);
    expect(banner).toContain("project memory");
  });
});

describe("stopDecision", () => {
  it("blocks stop when the phase is stop-gated and artifacts are missing", () => {
    root = mkProject({ review: { requires: ["review.md"], requires_approval: true } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "review", gates: { review: { requires: ["review.md"], requires_approval: true, human_approved: false } } };
    writeState(env, s);
    const d = stopDecision(env, s, "stop");
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("review.md");
  });
  it("allows stop when the phase is stop-gated but all required artifacts are present", () => {
    root = mkProject({ review: { requires: ["review.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/workflows/w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/workflows/w/review.md"), "x");
    const s: UsState = { ...baseState, phase: "review", gates: { review: { requires: ["review.md"], requires_approval: false, human_approved: false } } };
    writeState(env, s);
    const d = stopDecision(env, s, "stop");
    expect(d.decision).toBe("allow");
  });
  it("allows stop when nothing is gated", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    expect(stopDecision(env, baseState, "stop").decision).toBe("allow");
  });
  it("allows stop in non-stop-gated phase even with missing artifacts", () => {
    root = mkProject({ spec: { requires: ["spec.md"], requires_approval: false } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "spec", gates: { spec: { requires: ["spec.md"], requires_approval: false, human_approved: false } } };
    writeState(env, s);
    const d = stopDecision(env, s, "stop");
    expect(d.decision).toBe("allow");
  });
  it("nudges when many writes accumulated, then stays quiet", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    const entries = Array.from({ length: 20 }, (_, i) => ({
      at: "2026-01-01T00:00:00Z", session_id: "s", event: "post_write", note: "n",
    }));
    const s: UsState = { ...baseState, session_log: entries, nudge_marker: null };
    writeState(env, s);

    // First nudge
    const d1 = stopDecision(env, s, "stop");
    expect(d1.decision).toBe("nudge");

    // Check state was updated
    const updated = JSON.parse(fs.readFileSync(env.stateFile, "utf8"));
    expect(updated.nudge_marker).toBe(10); // 20 / 2 = 10

    // Second stop with updated state
    const d2 = stopDecision(env, updated, "stop");
    expect(d2.decision).toBe("allow");
  });
  it("nudges on pre_compact event", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    const entries = Array.from({ length: 18 }, (_, i) => ({
      at: "2026-01-01T00:00:00Z", session_id: "s", event: "post_write", note: "n",
    }));
    const s: UsState = { ...baseState, session_log: entries };
    writeState(env, s);

    const d = stopDecision(env, s, "pre_compact");
    expect(d.decision).toBe("nudge");
  });
  it("stop-check always returns a decision (never throws)", () => {
    root = mkProject({ review: { requires: ["review.md"], requires_approval: true } });
    const env = resolveEnv(root)!;
    const s: UsState = { ...baseState, phase: "review", gates: { review: { requires: ["review.md"], requires_approval: true, human_approved: false } } };
    writeState(env, s);
    expect(() => stopDecision(env, s, "stop")).not.toThrow();
  });
  it("allows pre_compact when not gated", () => {
    root = mkProject({});
    const env = resolveEnv(root)!;
    writeState(env, baseState);
    expect(stopDecision(env, baseState, "pre_compact").decision).toBe("allow");
  });
});

describe("edge cases from bash tests", () => {
  it("user_prompt with no workflow (empty state) -> no context", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    // In TypeScript we work with state objects, but the concept is no active workflow
    const emptyS: UsState = { ...baseState, workflow: "" };
    const text = phaseBannerShort(env, emptyS);
    // Should not crash
    expect(typeof text).toBe("string");
  });
  it("missing artifacts: filter works with complex paths", () => {
    root = mkProject({ spec: { requires: ["doc/spec.md", "tests/spec.test.ts"], requires_approval: false } });
    const env = resolveEnv(root)!;
    const s: UsState = {
      ...baseState,
      phase: "spec",
      gates: { spec: { requires: ["doc/spec.md", "tests/spec.test.ts"], requires_approval: false, human_approved: false } },
    };
    fs.mkdirSync(path.join(root, "ultraspec/workflows/w/doc"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec/workflows/w/doc/spec.md"), "x");
    expect(missingArtifacts(env, s, "spec")).toEqual(["tests/spec.test.ts"]);
  });
  it("latestHandoff sorts by mtime not filename", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    fs.mkdirSync(path.join(root, "ultraspec/handoffs"), { recursive: true });
    // Create files with names that would sort differently than by mtime
    const p1 = path.join(root, "ultraspec/handoffs/w-aaa.md");
    const p2 = path.join(root, "ultraspec/handoffs/w-zzz.md");
    fs.writeFileSync(p1, "old");
    fs.writeFileSync(p2, "newer");

    // Set p1 to recent, p2 to old
    fs.utimesSync(p1, 2000000000, 2000000000); // future
    fs.utimesSync(p2, 1000000000, 1000000000); // past

    const latest = latestHandoff(env, baseState);
    expect(latest).toContain("w-aaa.md");
  });
  it("stopDecision uses threshold from config", () => {
    root = mkProject();
    const cfg = JSON.parse(fs.readFileSync(path.join(root, "ultraspec/us.config.json"), "utf8"));
    cfg.handoff.nudge_threshold = 10; // higher threshold
    fs.writeFileSync(path.join(root, "ultraspec/us.config.json"), JSON.stringify(cfg));

    const env = resolveEnv(root)!;
    // With 9 writes and threshold 10, should not nudge
    const entries = Array.from({ length: 9 }, (_, i) => ({
      at: "2026-01-01T00:00:00Z", session_id: "s", event: "post_write", note: "n",
    }));
    const s: UsState = { ...baseState, session_log: entries };
    writeState(env, s);

    const d = stopDecision(env, s, "stop");
    expect(d.decision).not.toBe("nudge");
  });
  it("stopDecision returns nudge even if nudge_marker patchState fails (fail-open)", () => {
    root = mkProject();
    const env = resolveEnv(root)!;
    const entries = Array.from({ length: 20 }, (_, i) => ({
      at: "2026-01-01T00:00:00Z", session_id: "s", event: "post_write", note: "n",
    }));
    const s: UsState = { ...baseState, session_log: entries, nudge_marker: null };
    writeState(env, s);

    // Make the ultraspec directory read-only to block patchState's write attempt
    const ultraspecDir = path.join(root, "ultraspec");
    fs.chmodSync(ultraspecDir, 0o555); // read-only

    // Should still return nudge without throwing, even though patchState will fail
    const d = stopDecision(env, s, "stop");
    expect(d.decision).toBe("nudge");
    expect(d.reason).toContain("Molto lavoro dall'ultimo handoff");

    // Restore permissions for cleanup in afterEach
    fs.chmodSync(ultraspecDir, 0o755);
  });
});
