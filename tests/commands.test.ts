import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveEnv, readState } from "../src/lib/state.js";
import { cmdStart } from "../src/commands/start.js";
import { cmdSetTrack } from "../src/commands/setTrack.js";
import { cmdApprove } from "../src/commands/approve.js";
import { cmdAdvance } from "../src/commands/advance.js";
import { cmdReopen } from "../src/commands/reopen.js";
import { cmdStatus } from "../src/commands/status.js";
import { cmdBoard } from "../src/commands/board.js";
import { cmdHandoffPath, cmdHandoffDone } from "../src/commands/handoff.js";

function mkProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "us-cmd-"));
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
      protected_always_globs: [],
      protected_globs: [],
      always_allowed_globs: [],
      phase_commands: {},
      gates: {
        discover: { requires: ["discovery.md"], requires_approval: false },
        spec: { requires: ["spec.md"], requires_approval: true },
        plan: { requires: ["plan.md"], requires_approval: true },
      },
      agent_instructions: "auto",
      memory: { enabled: false },
      handoff: { nudge_threshold: 15 },
    })
  );
  return root;
}

function env(root: string) {
  return resolveEnv(root)!;
}

let root: string;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

function readWf(r: string) {
  return JSON.parse(fs.readFileSync(path.join(r, "ultraspec", ".us-state.json"), "utf8"));
}

// setup a project in phase spec with discovery.md/artifact dirs in place
function setupSpec(): string {
  const r = mkProject();
  cmdStart(env(r), ["w", "--track", "greenfield", "--harness", "claude-code"]);
  fs.mkdirSync(path.join(r, "ultraspec", "workflows", "w"), { recursive: true });
  fs.writeFileSync(path.join(r, "ultraspec", "workflows", "w", "discovery.md"), "");
  cmdAdvance(env(r), []); // intake -> discover
  cmdAdvance(env(r), []); // discover -> spec
  return r;
}

describe("cmdStart", () => {
  it("start without --track is rejected and writes no state", () => {
    root = mkProject();
    expect(() => cmdStart(env(root), ["feat"])).toThrow(/track mancante o non valido/);
    expect(fs.existsSync(path.join(root, "ultraspec", ".us-state.json"))).toBe(false);
  });

  it("start --track brownfield creates state at phase intake", () => {
    root = mkProject();
    cmdStart(env(root), ["feat", "--track", "brownfield", "--harness", "claude-code"]);
    const s = readWf(root);
    expect(s.phase).toBe("intake");
    expect(s.track).toBe("brownfield");
    expect(s.harness).toBe("claude-code");
    expect(s.history[0].event).toBe("start");
    expect(s.gates.spec.human_approved).toBe(false);
  });

  it("refuses a second active workflow", () => {
    root = mkProject();
    cmdStart(env(root), ["demo", "--track", "greenfield"]);
    expect(() => cmdStart(env(root), ["altro", "--track", "greenfield"])).toThrow(/esiste già un workflow attivo/);
  });

  it("rejects an unknown name-less workflow", () => {
    root = mkProject();
    expect(() => cmdStart(env(root), [])).toThrow(/manca il nome del workflow/);
  });

  it("rejects unknown option", () => {
    root = mkProject();
    expect(() => cmdStart(env(root), ["x", "--bogus", "y"])).toThrow(/opzione sconosciuta/);
  });
});

describe("cmdAdvance / cmdApprove (4.2 + 4.5)", () => {
  it("advance from intake needs no gate; reaches discover then spec", () => {
    root = setupSpec();
    const s = readWf(root);
    expect(s.phase).toBe("spec");
    expect(s.phases_done.join(" ")).toBe("intake discover");
  });

  it("refuses when required artifacts are missing", () => {
    root = mkProject();
    cmdStart(env(root), ["demo", "--track", "greenfield"]);
    cmdAdvance(env(root), []); // intake -> discover has no gate requirement (no discovery.md needed since intake gate absent)
    expect(() => cmdAdvance(env(root), [])).toThrow(/mancano gli artefatti/);
  });

  it("advance from spec is refused while spec.md is missing", () => {
    root = setupSpec();
    expect(() => cmdAdvance(env(root), [])).toThrow(/mancano gli artefatti/);
    expect(readWf(root).phase).toBe("spec");
  });

  it("advance from spec is refused when artifacts exist but not approved", () => {
    root = setupSpec();
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    expect(() => cmdAdvance(env(root), [])).toThrow(/approvazione/);
  });

  it("approve sets human_approved and logs history", () => {
    root = setupSpec();
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    cmdApprove(env(root), ["spec"]);
    const s = readWf(root);
    expect(s.gates.spec.human_approved).toBe(true);
    expect(s.history[s.history.length - 1].event).toBe("approve");
  });

  it("advance from spec now succeeds -> plan", () => {
    root = setupSpec();
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    cmdApprove(env(root), ["spec"]);
    cmdAdvance(env(root), []);
    expect(readWf(root).phase).toBe("plan");
  });

  it("only 'approve' ever writes human_approved (advance never does)", () => {
    root = setupSpec();
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    cmdApprove(env(root), ["spec"]);
    cmdAdvance(env(root), []); // -> plan
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "plan.md"), "");
    expect(() => cmdAdvance(env(root), [])).toThrow();
    const s = readWf(root);
    expect(s.gates.plan.human_approved).toBe(false);
    expect(s.phase).toBe("plan");
  });

  it("approve rejects a phase without a gate", () => {
    root = mkProject();
    cmdStart(env(root), ["demo", "--track", "greenfield"]);
    expect(() => cmdApprove(env(root), ["intake"])).toThrow(/non ha un gate da approvare/);
  });

  it("advance rejects at the final phase", () => {
    root = setupSpec(); // phase spec
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    cmdApprove(env(root), ["spec"]);
    cmdAdvance(env(root), []); // -> plan
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "plan.md"), "");
    cmdApprove(env(root), ["plan"]);
    cmdAdvance(env(root), []); // -> build
    cmdAdvance(env(root), []); // -> review
    cmdAdvance(env(root), []); // -> archive
    cmdAdvance(env(root), []); // -> done
    expect(readWf(root).phase).toBe("done");
    expect(() => cmdAdvance(env(root), [])).toThrow(/sei già alla fase finale/);
  });
});

describe("cmdReopen (4.3)", () => {
  it("reopen without --reason is rejected", () => {
    root = setupSpec();
    expect(() => cmdReopen(env(root), ["spec"])).toThrow(/reopen richiede --reason/);
  });

  it("reopen forward is rejected (ratchet)", () => {
    root = setupSpec();
    expect(() => cmdReopen(env(root), ["review", "--reason", "x"])).toThrow(/reopen va solo indietro/);
  });

  it("reopen an unknown phase is rejected", () => {
    root = setupSpec();
    expect(() => cmdReopen(env(root), ["nope", "--reason", "x"])).toThrow(/fase sconosciuta/);
  });

  it("reopen backward to spec works, resets downstream approval, logs reason", () => {
    root = setupSpec();
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    cmdApprove(env(root), ["spec"]);
    cmdAdvance(env(root), []); // -> plan
    cmdReopen(env(root), ["spec", "--reason", "design gap trovato"]);
    const s = readWf(root);
    expect(s.phase).toBe("spec");
    expect(s.gates.spec.human_approved).toBe(false);
    expect(s.history[s.history.length - 1].event).toBe("reopen");
    expect(s.history[s.history.length - 1].reason).toContain("design gap");
    expect(s.phases_done.join(" ")).toBe("intake discover");
  });

  it("reopen to an earlier phase (intake) also works", () => {
    root = setupSpec();
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "spec.md"), "");
    cmdApprove(env(root), ["spec"]);
    cmdAdvance(env(root), []); // -> plan
    cmdReopen(env(root), ["intake", "--reason", "ripartn da capo"]);
    const s = readWf(root);
    expect(s.phase).toBe("intake");
    expect(s.phases_done.join(" ")).toBe("");
  });
});

describe("cmdStatus (4.4)", () => {
  it("status --json reports phase, missing artifacts, enforcement", () => {
    // enforcementLevel() reads adapters/SUPPORT.md from the package root (it ships
    // there, not copied into the project by init — see status.ts), so this exercises
    // the real repo's adapters/SUPPORT.md; the claude-code row there has 4 X's -> "completo".
    root = setupSpec();
    const out = cmdStatus(env(root), ["--json"]);
    const j = JSON.parse(out);
    expect(j.phase).toBe("spec");
    expect(j.missing_artifacts.join(",")).toContain("spec.md");
    expect(j.enforcement).toContain("completo");
  });

  it("status (text) explains the code-edit block in spec", () => {
    root = setupSpec();
    const out = cmdStatus(env(root), []);
    expect(out).toContain("modifiche a codice di prodotto bloccate");
    expect(out).toContain("fase     : spec");
  });

  it("status with no workflow says so", () => {
    root = mkProject();
    const out = cmdStatus(env(root), []);
    expect(out).toContain("nessun workflow attivo");
  });
});

describe("cmdSetTrack", () => {
  it("switches greenfield<->brownfield while in intake/discover", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield", "--harness", "claude-code"]);
    cmdSetTrack(env(root), ["brownfield"]);
    const s = readWf(root);
    expect(s.track).toBe("brownfield");
    expect(s.history[s.history.length - 1].event).toBe("set-track");
  });

  it("is refused once past discover", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield", "--harness", "claude-code"]);
    cmdSetTrack(env(root), ["brownfield"]);
    fs.mkdirSync(path.join(root, "ultraspec", "workflows", "w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "discovery.md"), "");
    cmdAdvance(env(root), []); // intake -> discover
    cmdAdvance(env(root), []); // discover -> spec
    expect(() => cmdSetTrack(env(root), ["greenfield"])).toThrow(/si cambia solo in intake\/discover/);
    expect(readWf(root).track).toBe("brownfield");
  });

  it("returns early when track is already set", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield"]);
    const out = cmdSetTrack(env(root), ["greenfield"]);
    expect(out).toContain('track già "greenfield"');
  });

  it("uso message on invalid track", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield"]);
    expect(() => cmdSetTrack(env(root), ["bogus"])).toThrow(/uso: \/ultraspec:set-track/);
  });
});

describe("cmdBoard", () => {
  it("runs and shows the workflow + a history section", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield", "--harness", "claude-code"]);
    fs.mkdirSync(path.join(root, "ultraspec", "workflows", "w"), { recursive: true });
    fs.writeFileSync(path.join(root, "ultraspec", "workflows", "w", "discovery.md"), "");
    cmdAdvance(env(root), []);
    cmdAdvance(env(root), []);
    const out = cmdBoard(env(root), []);
    expect(out).toContain("fase     : spec");
    expect(out).toContain("History");
    expect(out).toContain("Tutti i workflow");
    expect(out).toContain("Test");
  });
});

describe("cmdHandoffPath / cmdHandoffDone", () => {
  it("handoff-path requires an active workflow", () => {
    root = mkProject();
    expect(() => cmdHandoffPath(env(root), [])).toThrow(/nessun workflow attivo/);
  });

  it("handoff-path returns a path under handoffs_dir and creates the dir", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield"]);
    const out = cmdHandoffPath(env(root), []).trim();
    expect(out).toContain(path.join(root, "ultraspec", "handoffs"));
    expect(out.endsWith(".md")).toBe(true);
    expect(fs.existsSync(path.join(root, "ultraspec", "handoffs"))).toBe(true);
  });

  it("handoff-done rejects a missing file", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield"]);
    expect(() => cmdHandoffDone(env(root), ["/no/such/file.md"])).toThrow(/file di handoff non trovato/);
  });

  it("handoff-done stamps last_handoff_at", () => {
    root = mkProject();
    cmdStart(env(root), ["w", "--track", "greenfield"]);
    const p = cmdHandoffPath(env(root), []).trim();
    fs.writeFileSync(p, "# handoff\n");
    const out = cmdHandoffDone(env(root), [p]);
    expect(out).toContain("handoff registrato");
    expect(readWf(root).last_handoff_at).not.toBeNull();
  });
});
