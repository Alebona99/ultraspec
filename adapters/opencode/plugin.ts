/**
 * ultraspec adapter — OpenCode
 *
 * One job: translate. OpenCode's native hook payloads <-> ultraspec's
 * normalized event/decision, delegating ALL logic to the shell core in
 * ../../hooks. Contains no workflow rules.
 *
 * Install: add to opencode.json  "plugin": ["./ultraspec/adapters/opencode/plugin.ts"]
 */
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOKS = path.resolve(HERE, "../../hooks");

type Decision = { decision: "allow" | "deny" | "block" | "nudge"; reason?: string; context?: string };

/** Run a core hook script with a normalized event on stdin, return its decision. */
export function runCore(script: string, event: Record<string, unknown>): Decision {
  try {
    const r = spawnSync("bash", [path.join(HOOKS, script)], {
      input: JSON.stringify(event),
      encoding: "utf8",
      timeout: 10_000,
    });
    return JSON.parse((r.stdout || "").trim() || '{"decision":"allow"}');
  } catch {
    return { decision: "allow", reason: "adapter error (fail-open)" };
  }
}

/** OpenCode tool.execute.before payload -> normalized event (pure, unit-testable). */
export function toEvent(
  kind: "pre" | "post",
  tool: string,
  args: Record<string, any>,
  directory: string,
  sessionID: string,
): Record<string, unknown> {
  const base = { harness: "opencode", cwd: directory, session_id: sessionID };
  const t = tool.toLowerCase();
  if (["write", "edit", "patch"].includes(t)) {
    return { ...base, event: kind === "pre" ? "pre_write" : "post_write", target_path: args?.filePath ?? args?.path ?? args?.file ?? null };
  }
  if (["bash", "shell"].includes(t) && kind === "pre") {
    return { ...base, event: "pre_bash", command: args?.command ?? null };
  }
  return { ...base, event: "ignore" };
}

export const UltraspecPlugin = async ({ directory }: { directory: string }) => {
  const bannerText = (): string => {
    const ev = { harness: "opencode", event: "session_start", cwd: directory, session_id: "" };
    const d = runCore("us-banner.sh", ev);
    return d.context ?? "";
  };

  return {
    "tool.execute.before": async (input: { tool: string; sessionID: string }, output: { args: any }) => {
      const ev = toEvent("pre", input.tool, output.args ?? {}, directory, input.sessionID);
      if (ev.event === "ignore") return;
      const script = ev.event === "pre_bash" ? "us-gate.sh" : "us-gate.sh";
      const d = runCore(script, ev);
      if (d.decision === "deny") {
        throw new Error(`[ultraspec] ${d.reason ?? "azione bloccata dalla fase corrente del workflow"}`);
      }
    },

    "tool.execute.after": async (input: { tool: string; sessionID: string; args: any }) => {
      const ev = toEvent("post", input.tool, input.args ?? {}, directory, input.sessionID);
      if (ev.event === "ignore") return;
      runCore("us-nudge.sh", ev); // fire-and-forget; never blocks
    },

    "experimental.chat.messages.transform": async (_i: unknown, output: { messages: any[] }) => {
      const text = bannerText();
      if (!text || !output.messages?.length) return;
      const firstUser = output.messages.find((m) => m.info?.role === "user");
      if (!firstUser?.parts?.length) return;
      if (firstUser.parts.some((p: any) => p.type === "text" && p.text?.includes("[ultraspec]"))) return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: "text", text: `[ultraspec context]\n${text}` });
    },
  };
};

export default UltraspecPlugin;

// tiny guard so `node plugin.ts --selftest` is meaningful without OpenCode
if (process.argv.includes("--selftest")) {
  const ok = fs.existsSync(path.join(HOOKS, "us-gate.sh"));
  console.log(ok ? "core hooks reachable" : "core hooks MISSING");
  process.exit(ok ? 0 : 1);
}
