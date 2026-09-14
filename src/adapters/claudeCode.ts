import { normalizeEvent } from "../lib/event.js";
import { decide as gateDecide } from "../hooks/gate.js";
import { decide as bannerDecide } from "../hooks/banner.js";
import { decide as stopDecide } from "../hooks/stopCheck.js";
import { decide as nudgeDecide } from "../hooks/nudge.js";

export function handleClaudeCodeHook(
  core: "gate" | "banner" | "stop" | "nudge",
  cwd: string,
  nativePayload: unknown,
): { exitCode: number; stdout: string; stderr: string } {
  const event = normalizeEvent("claude-code", nativePayload);
  const decisionFn = { gate: gateDecide, banner: bannerDecide, stop: stopDecide, nudge: nudgeDecide }[core];
  const d = decisionFn(cwd, event);

  const emitJson = (hookEventName: string, context: string) =>
    JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: context } });

  if (core === "gate") {
    if (d.decision === "deny") return { exitCode: 2, stdout: "", stderr: d.reason ?? "blocked by ultraspec" };
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  if (core === "banner") {
    const hk = event.event === "user_prompt" ? "UserPromptSubmit" : "SessionStart";
    return { exitCode: 0, stdout: d.context ? emitJson(hk, d.context) : "", stderr: "" };
  }
  if (core === "stop") {
    if (d.decision === "block" || d.decision === "nudge") return { exitCode: 2, stdout: "", stderr: d.reason ?? "ultraspec: fase non completata" };
    return { exitCode: 0, stdout: "", stderr: "" };
  }
  // nudge
  return { exitCode: 0, stdout: d.context ? emitJson("PostToolUse", d.context) : "", stderr: "" };
}
