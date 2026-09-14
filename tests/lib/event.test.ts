import { describe, it, expect } from "vitest";
import { normalizeEvent } from "../../src/lib/event.js";

describe("normalizeEvent — claude-code", () => {
  it("PreToolUse Write -> pre_write with target_path", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/a/b.ts" },
      cwd: "/a",
      session_id: "s1",
    });
    expect(ev).toMatchObject({
      event: "pre_write",
      target_path: "/a/b.ts",
      cwd: "/a",
      session_id: "s1",
      harness: "claude-code",
    });
  });

  it("PreToolUse Edit -> pre_write with target_path", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/x/y.ts", old_string: "a", new_string: "b" },
    });
    expect(ev).toMatchObject({
      event: "pre_write",
      target_path: "/x/y.ts",
      harness: "claude-code",
    });
  });

  it("PreToolUse MultiEdit -> pre_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "MultiEdit",
      tool_input: { file_path: "/x/z.ts" },
    });
    expect(ev.event).toBe("pre_write");
    expect(ev.target_path).toBe("/x/z.ts");
  });

  it("PreToolUse NotebookEdit -> pre_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "/nb.ipynb" },
    });
    expect(ev.event).toBe("pre_write");
    expect(ev.target_path).toBe("/nb.ipynb");
  });

  it("PreToolUse Bash -> pre_bash with command", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git commit -m x" },
    });
    expect(ev).toMatchObject({ event: "pre_bash", command: "git commit -m x" });
  });

  it("PostToolUse Write -> post_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/a/c.ts" },
    });
    expect(ev.event).toBe("post_write");
    expect(ev.target_path).toBe("/a/c.ts");
  });

  it("PostToolUse Edit -> post_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "/a/c.ts" },
    });
    expect(ev.event).toBe("post_write");
  });

  it("PostToolUse MultiEdit -> post_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PostToolUse",
      tool_name: "MultiEdit",
      tool_input: { file_path: "/a/c.ts" },
    });
    expect(ev.event).toBe("post_write");
  });

  it("PostToolUse NotebookEdit -> post_write", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PostToolUse",
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "/nb.ipynb" },
    });
    expect(ev.event).toBe("post_write");
  });

  it("SessionStart -> session_start", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "SessionStart" }).event).toBe("session_start");
  });

  it("SessionStart with reason -> session_start with reason", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "SessionStart",
      session_id: "s2",
      reason: "startup",
    });
    expect(ev.event).toBe("session_start");
    expect(ev.session_id).toBe("s2");
    expect(ev.reason).toBe("startup");
  });

  it("UserPromptSubmit -> user_prompt", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "UserPromptSubmit" }).event).toBe("user_prompt");
  });

  it("Stop -> stop", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "Stop" }).event).toBe("stop");
  });

  it("SubagentStop -> stop", () => {
    expect(normalizeEvent("claude-code", { hook_event_name: "SubagentStop" }).event).toBe("stop");
  });

  it("PreCompact -> pre_compact", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreCompact",
      reason: "auto",
    });
    expect(ev.event).toBe("pre_compact");
    expect(ev.reason).toBe("auto");
  });

  it("unhandled tool (Read) -> ignore", () => {
    expect(
      normalizeEvent("claude-code", { hook_event_name: "PreToolUse", tool_name: "Read" }).event
    ).toBe("ignore");
  });

  it("unhandled event (Notification) -> ignore", () => {
    expect(
      normalizeEvent("claude-code", { hook_event_name: "Notification" }).event
    ).toBe("ignore");
  });

  it("PostToolUse with unhandled tool -> ignore", () => {
    expect(
      normalizeEvent("claude-code", {
        hook_event_name: "PostToolUse",
        tool_name: "Read",
      }).event
    ).toBe("ignore");
  });

  it("handles alternative path fields in tool_input", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { path: "/alt/path.ts" },
    });
    expect(ev.target_path).toBe("/alt/path.ts");
  });

  it("handles cwd from various field names", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "SessionStart",
      workspace: "/workspace",
    });
    expect(ev.cwd).toBe("/workspace");
  });

  it("handles session_id from various field names", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "SessionStart",
      sessionID: "alt_session",
    });
    expect(ev.session_id).toBe("alt_session");
  });

  it("preserves raw payload", () => {
    const raw = { hook_event_name: "SessionStart", custom_field: "value" };
    const ev = normalizeEvent("claude-code", raw);
    expect(ev.raw).toEqual(raw);
  });
});

describe("normalizeEvent — opencode", () => {
  it("tool.execute.before write -> pre_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "write",
      args: { filePath: "/a/b.ts" },
    });
    expect(ev).toMatchObject({ event: "pre_write", target_path: "/a/b.ts" });
  });

  it("tool.execute.before edit -> pre_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "edit",
      args: { filePath: "/a/b.ts" },
    });
    expect(ev.event).toBe("pre_write");
  });

  it("tool.execute.before patch -> pre_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "patch",
      args: { filePath: "/a/b.ts" },
    });
    expect(ev.event).toBe("pre_write");
  });

  it("tool.execute.before bash -> pre_bash", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "bash",
      args: { command: "git push" },
    });
    expect(ev).toMatchObject({ event: "pre_bash", command: "git push" });
  });

  it("tool.execute.before shell -> pre_bash", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "shell",
      args: { command: "git push" },
    });
    expect(ev.event).toBe("pre_bash");
  });

  it("tool.execute.after -> post_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "tool.execute.after",
      args: { filePath: "/a/b.ts" },
    });
    expect(ev.event).toBe("post_write");
    expect(ev.target_path).toBe("/a/b.ts");
  });

  it("pre_tool (alternative kind name) -> pre_write for write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "pre_tool",
      tool: "write",
      args: { filePath: "/x/y.ts" },
    });
    expect(ev.event).toBe("pre_write");
  });

  it("post_tool (alternative kind name) -> post_write", () => {
    const ev = normalizeEvent("opencode", {
      kind: "post_tool",
      args: { filePath: "/x/y.ts" },
    });
    expect(ev.event).toBe("post_write");
  });

  it("session.start -> session_start", () => {
    const ev = normalizeEvent("opencode", { kind: "session.start" });
    expect(ev.event).toBe("session_start");
  });

  it("session_start (alternative name) -> session_start", () => {
    const ev = normalizeEvent("opencode", { kind: "session_start" });
    expect(ev.event).toBe("session_start");
  });

  it("session.idle -> stop", () => {
    const ev = normalizeEvent("opencode", { kind: "session.idle" });
    expect(ev.event).toBe("stop");
  });

  it("stop -> stop", () => {
    const ev = normalizeEvent("opencode", { kind: "stop" });
    expect(ev.event).toBe("stop");
  });

  it("unhandled tool/kind -> ignore", () => {
    expect(
      normalizeEvent("opencode", {
        kind: "tool.execute.before",
        tool: "unknown-tool",
      }).event
    ).toBe("ignore");
  });

  it("uses hook field name as fallback for kind", () => {
    const ev = normalizeEvent("opencode", {
      hook: "tool.execute.before",
      tool: "write",
      args: { filePath: "/x/y.ts" },
    });
    expect(ev.event).toBe("pre_write");
  });

  it("handles alternative args field names (path, file)", () => {
    let ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "write",
      args: { path: "/alt/path.ts" },
    });
    expect(ev.target_path).toBe("/alt/path.ts");

    ev = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "write",
      args: { file: "/file/path.ts" },
    });
    expect(ev.target_path).toBe("/file/path.ts");
  });

  it("handles directory and sessionID fields", () => {
    const ev = normalizeEvent("opencode", {
      kind: "session.start",
      directory: "/work",
      sessionID: "oc1",
    });
    expect(ev.cwd).toBe("/work");
    expect(ev.session_id).toBe("oc1");
  });
});

describe("normalizeEvent — generic-git", () => {
  it("generic-git with no command -> pre_bash with default 'git commit'", () => {
    const ev = normalizeEvent("generic-git", {});
    expect(ev).toMatchObject({ event: "pre_bash", command: "git commit" });
  });

  it("generic-git with command -> pre_bash with that command", () => {
    const ev = normalizeEvent("generic-git", { command: "git push origin main" });
    expect(ev).toMatchObject({
      event: "pre_bash",
      command: "git push origin main",
    });
  });

  it("generic-git preserves harness", () => {
    const ev = normalizeEvent("generic-git", {});
    expect(ev.harness).toBe("generic-git");
  });
});

describe("normalizeEvent — unknown harness / passthrough", () => {
  it("unknown harness -> passthrough of payload", () => {
    const ev = normalizeEvent("mystery-agent", {
      event: "pre_write",
      target_path: "/x",
    });
    expect(ev).toMatchObject({
      event: "pre_write",
      target_path: "/x",
      harness: "mystery-agent",
    });
  });

  it("unknown harness with missing event -> ignore", () => {
    const ev = normalizeEvent("mystery-agent", { target_path: "/x" });
    expect(ev.event).toBe("ignore");
  });

  it("unknown harness preserves custom fields in raw", () => {
    const raw = {
      event: "pre_bash",
      command: "echo test",
      custom_field: "value",
    };
    const ev = normalizeEvent("unknown", raw);
    expect(ev.raw).toEqual(raw);
  });

  it("unknown harness extracts command if present", () => {
    const ev = normalizeEvent("custom-runner", {
      event: "pre_bash",
      command: "npm test",
    });
    expect(ev.command).toBe("npm test");
  });

  it("unknown harness extracts target_path if present", () => {
    const ev = normalizeEvent("custom-writer", {
      event: "post_write",
      target_path: "/src/file.js",
    });
    expect(ev.target_path).toBe("/src/file.js");
  });
});

describe("normalizeEvent — malformed / edge cases", () => {
  it("non-object raw (string) -> event ignore, harness preserved", () => {
    const ev = normalizeEvent("claude-code", "not an object" as unknown);
    expect(ev.event).toBe("ignore");
    expect(ev.harness).toBe("claude-code");
  });

  it("non-object raw (number) -> event ignore, harness preserved", () => {
    const ev = normalizeEvent("opencode", 42 as unknown);
    expect(ev.event).toBe("ignore");
    expect(ev.harness).toBe("opencode");
  });

  it("null raw -> event ignore, harness preserved", () => {
    const ev = normalizeEvent("generic-git", null as unknown);
    expect(ev.event).toBe("ignore");
    expect(ev.harness).toBe("generic-git");
  });

  it("null cwd/session_id fields are preserved as null", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "SessionStart",
      cwd: null,
      session_id: null,
    });
    expect(ev.cwd).toBeNull();
    expect(ev.session_id).toBeNull();
  });

  it("all nullable fields default to null if missing", () => {
    const ev = normalizeEvent("claude-code", { hook_event_name: "SessionStart" });
    expect(ev.cwd).toBeNull();
    expect(ev.session_id).toBeNull();
    expect(ev.target_path).toBeNull();
    expect(ev.command).toBeNull();
    expect(ev.reason).toBeNull();
  });

  it("empty tool_input -> target_path null", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: {},
    });
    expect(ev.target_path).toBeNull();
  });

  it("missing tool_input entirely -> target_path null", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
    });
    expect(ev.target_path).toBeNull();
  });
});

describe("normalizeEvent — integration: claude-code vs opencode equivalence", () => {
  it("same normalized event from claude-code and opencode for a write", () => {
    const cc = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/src/app.js" },
      session_id: "s1",
      cwd: "/root",
    });

    const oc = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "write",
      args: { filePath: "/src/app.js" },
      sessionID: "s1",
      directory: "/root",
    });

    expect(cc.event).toBe(oc.event);
    expect(cc.target_path).toBe(oc.target_path);
    expect(cc.command).toBe(oc.command);
  });

  it("same normalized event from claude-code and opencode for a bash commit", () => {
    const cc = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git commit -m wip" },
    });

    const oc = normalizeEvent("opencode", {
      kind: "tool.execute.before",
      tool: "bash",
      args: { command: "git commit -m wip" },
    });

    expect(cc.event).toBe("pre_bash");
    expect(oc.event).toBe("pre_bash");
    expect(cc.command).toContain("git commit");
    expect(oc.command).toContain("git commit");
  });
});

describe("normalizeEvent — schema compliance", () => {
  it("all events produce valid NormalizedEvent shape", () => {
    const events = ["session_start", "user_prompt", "pre_write", "pre_bash", "post_write", "stop", "pre_compact", "ignore"] as const;

    for (const eventName of events) {
      const ev = normalizeEvent("test-harness", { event: eventName });
      expect(ev).toHaveProperty("event");
      expect(ev).toHaveProperty("harness");
      expect(ev).toHaveProperty("cwd");
      expect(ev).toHaveProperty("session_id");
      expect(ev).toHaveProperty("target_path");
      expect(ev).toHaveProperty("command");
      expect(ev).toHaveProperty("reason");
      expect(ev).toHaveProperty("raw");
    }
  });

  it("pre_write events have target_path set", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/x/y.ts" },
    });
    expect(ev.event).toBe("pre_write");
    expect(typeof ev.target_path).toBe("string");
  });

  it("pre_bash events have command set", () => {
    const ev = normalizeEvent("claude-code", {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: "git push" },
    });
    expect(ev.event).toBe("pre_bash");
    expect(typeof ev.command).toBe("string");
  });

  it("reason field from raw.source fallback", () => {
    const ev = normalizeEvent("opencode", {
      kind: "session.start",
      source: "manual",
    });
    expect(ev.reason).toBe("manual");
  });
});
