import { describe, it, expect, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { main } from "../src/cli.js";

let root: string;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); });

function mkProject() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "us-cli-"));
  fs.mkdirSync(path.join(root, "ultraspec"), { recursive: true });
  fs.writeFileSync(path.join(root, "ultraspec", "us.config.json"), JSON.stringify({
    state_file: "ultraspec/.us-state.json", workflows_dir: "ultraspec/workflows",
    handoffs_dir: "ultraspec/handoffs", memory_dir: "ultraspec/memory",
    phase_order: ["intake", "discover"], code_edit_allowed_from: "build",
    commit_allowed_phases: [], stop_gated_phases: [], protected_always_globs: [],
    protected_globs: [], always_allowed_globs: [], phase_commands: {}, gates: {},
    agent_instructions: "auto", memory: { enabled: false }, handoff: { nudge_threshold: 15 },
  }));
}

describe("cli main()", () => {
  it("unknown subcommand -> rc 1, message on stderr", () => {
    mkProject();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rc = main(["mistero"], root);
    expect(rc).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("sotto-comando sconosciuto"));
    errSpy.mockRestore();
  });
  it("start then status --json round-trips through the real fs", () => {
    mkProject();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    main(["start", "demo", "--track", "greenfield"], root);
    const rc = main(["status", "--json"], root);
    expect(rc).toBe(0);
    const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(printed).toContain('"phase": "intake"');
    logSpy.mockRestore();
  });
});
