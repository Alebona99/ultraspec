import type { NormalizedEvent } from "../types.js";

function finish(harness: string, raw: any, partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    event: (partial.event as NormalizedEvent["event"]) ?? "ignore",
    harness,
    cwd: raw?.cwd ?? raw?.workspace ?? raw?.directory ?? null,
    session_id: raw?.session_id ?? raw?.sessionID ?? raw?.sessionId ?? raw?.session ?? null,
    target_path: partial.target_path ?? null,
    command: partial.command ?? null,
    reason: partial.reason ?? raw?.reason ?? raw?.source ?? null,
    raw,
  };
}

function claudeCode(raw: any): NormalizedEvent {
  const hev = raw?.hook_event_name;
  const tool = raw?.tool_name;
  let partial: Partial<NormalizedEvent> = { event: "ignore" };
  const writeTools = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
  if (hev === "PreToolUse") {
    if (writeTools.includes(tool)) {
      partial = { event: "pre_write", target_path: raw?.tool_input?.file_path ?? raw?.tool_input?.path ?? raw?.tool_input?.notebook_path ?? null };
    } else if (tool === "Bash") {
      partial = { event: "pre_bash", command: raw?.tool_input?.command ?? null };
    }
  } else if (hev === "PostToolUse" && writeTools.includes(tool)) {
    partial = { event: "post_write", target_path: raw?.tool_input?.file_path ?? raw?.tool_input?.path ?? null };
  } else if (hev === "SessionStart") partial = { event: "session_start" };
  else if (hev === "UserPromptSubmit") partial = { event: "user_prompt" };
  else if (hev === "Stop" || hev === "SubagentStop") partial = { event: "stop" };
  else if (hev === "PreCompact") partial = { event: "pre_compact" };
  return finish("claude-code", raw, partial);
}

function openCode(raw: any): NormalizedEvent {
  const kind = raw?.kind ?? raw?.hook;
  const tool = raw?.tool;
  let partial: Partial<NormalizedEvent> = { event: "ignore" };
  if (kind === "tool.execute.before" || kind === "pre_tool") {
    if (["write", "edit", "patch"].includes(tool)) {
      partial = { event: "pre_write", target_path: raw?.args?.filePath ?? raw?.args?.path ?? raw?.args?.file ?? null };
    } else if (["bash", "shell"].includes(tool)) {
      partial = { event: "pre_bash", command: raw?.args?.command ?? null };
    }
  } else if (kind === "tool.execute.after" || kind === "post_tool") {
    partial = { event: "post_write", target_path: raw?.args?.filePath ?? raw?.args?.path ?? null };
  } else if (kind === "session.start" || kind === "session_start") partial = { event: "session_start" };
  else if (kind === "session.idle" || kind === "stop") partial = { event: "stop" };
  return finish("opencode", raw, partial);
}

function genericGit(raw: any): NormalizedEvent {
  return finish("generic-git", raw, { event: "pre_bash", command: raw?.command ?? "git commit" });
}

function passthrough(raw: any, harness: string): NormalizedEvent {
  return finish(harness, raw, {
    event: (raw?.event as NormalizedEvent["event"]) ?? "ignore",
    target_path: raw?.target_path ?? null,
    command: raw?.command ?? null,
  });
}

export function normalizeEvent(harness: string, raw: unknown): NormalizedEvent {
  if (typeof raw !== "object" || raw === null) {
    return { event: "ignore", harness, cwd: null, session_id: null, target_path: null, command: null, reason: null, raw };
  }
  switch (harness) {
    case "claude-code": return claudeCode(raw);
    case "opencode": return openCode(raw);
    case "generic-git": return genericGit(raw);
    default: return passthrough(raw, harness);
  }
}
