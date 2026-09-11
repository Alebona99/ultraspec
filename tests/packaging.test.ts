// Packaging-consistency checks, porting tests/test_packaging.sh.
//
// Checks repo-root packaging artifacts directly with node:fs + JSON.parse —
// no jq subprocess, matching the rest of this TS port.
//
// Ported as-is: plugin.json validity/shape, hooks.json validity + 6-event
// coverage, marketplace.json validity, all 14 commands exist with a
// description, the 6 workflow/*.md files exist, commands reference the
// neutral workflow procedure, no cross-references to other frameworks.
//
// Dropped, not ported (see task-11b-report.md for the full rationale):
//  - "jq missing -> banner warns, allow (fail-open)" and
//    "jq missing -> gate allow (fail-open)": TypeScript has no jq dependency
//    at all, so this failure mode no longer exists.
//  - "config + state schemas validate the shipped files" (python3 +
//    jsonschema): dropped per the Task 3 controller ruling — no new
//    devDependency, TypeScript's own strict-mode typing already gives
//    equivalent structural guarantees within the codebase.
//
// NOT ported (found during this task, out of scope — see report): the bash
// check "commands invoke the CLI via ${CLAUDE_PLUGIN_ROOT}/bin/us" was
// supposed to be updated here to assert dist/cli.js instead, per the task
// brief's claim that Task 8 already changed commands/*.md to reference it.
// That claim does not hold: every commands/*.md file still invokes
// `bash "${CLAUDE_PLUGIN_ROOT}/bin/us"` (bin/us no longer exists in this
// worktree), while only adapters/claude-code/hooks.json was updated to
// dist/cli.js. Asserting dist/cli.js here would be a test that fails
// against a real, pre-existing bug, not a check of this port's work — so it
// is left out rather than either papering over the bug or silently fixing
// 16 unrelated files as a side effect of a test-porting task.
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));

const COMMANDS = [
  "start", "discover", "spec", "plan", "build", "review", "archive",
  "advance", "approve", "reopen", "status", "board", "handoff", "set-track",
];
const WORKFLOW_PHASES = ["discover", "spec", "plan", "build", "review", "archive"];
const OTHER_FRAMEWORKS = /superpowers|opsx|openspec|mattpocock|pr-review-toolkit|feature-dev|graphify/;

describe("packaging: plugin.json", () => {
  it("is valid JSON, named 'ultraspec', points at hooks + commands", () => {
    const p = readJson(path.join(repoRoot, ".claude-plugin", "plugin.json"));
    expect(p.name).toBe("ultraspec");
    expect(p.hooks).toContain("adapters/claude-code/hooks.json");
    expect(p.commands).toBe("./commands");
  });
});

describe("packaging: hooks.json", () => {
  it("is valid JSON and covers the 6 Claude Code events", () => {
    const h = readJson(path.join(repoRoot, "adapters", "claude-code", "hooks.json"));
    for (const k of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "PreCompact"]) {
      expect(h.hooks[k], `missing hook ${k}`).toBeTruthy();
    }
  });
});

describe("packaging: marketplace.json", () => {
  it("is valid JSON and lists the 'ultraspec' plugin", () => {
    const m = readJson(path.join(repoRoot, ".claude-plugin", "marketplace.json"));
    expect(m.plugins[0].name).toBe("ultraspec");
  });
});

describe("packaging: commands/", () => {
  it("all 14 /ultraspec: commands exist with a description in frontmatter", () => {
    expect(COMMANDS).toHaveLength(14);
    for (const c of COMMANDS) {
      const f = path.join(repoRoot, "commands", `${c}.md`);
      expect(fs.existsSync(f), `command ${c} missing`).toBe(true);
      const head = fs.readFileSync(f, "utf8").split("\n").slice(0, 5).join("\n");
      expect(head, `command ${c} has no description`).toMatch(/^description:/m);
    }
  });

  it("phase commands point at the neutral workflow procedure", () => {
    const content = fs.readFileSync(path.join(repoRoot, "commands", "spec.md"), "utf8");
    expect(content).toContain("workflow/spec.md");
  });

  it("no command/workflow/template/doc references another platform", () => {
    for (const dir of ["commands", "workflow", "templates", "docs"]) {
      const full = path.join(repoRoot, dir);
      if (!fs.existsSync(full)) continue;
      for (const f of fs.readdirSync(full)) {
        const fp = path.join(full, f);
        if (!fs.statSync(fp).isFile()) continue;
        const content = fs.readFileSync(fp, "utf8");
        expect(content, `${dir}/${f} references another platform`).not.toMatch(OTHER_FRAMEWORKS);
      }
    }
  });
});

describe("packaging: workflow/", () => {
  it("the 6 neutral phase procedures exist", () => {
    for (const w of WORKFLOW_PHASES) {
      expect(fs.existsSync(path.join(repoRoot, "workflow", `${w}.md`)), `workflow/${w}.md missing`).toBe(true);
    }
  });
});
