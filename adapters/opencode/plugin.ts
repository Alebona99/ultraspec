/**
 * ultraspec adapter — OpenCode
 *
 * One job: translate. OpenCode's native hook payloads <-> ultraspec's
 * normalized event/decision, delegating ALL logic to the compiled TS core
 * in ../../dist. Contains no workflow rules.
 *
 * Install: add to opencode.json  "plugin": ["./ultraspec/adapters/opencode/plugin.ts"]
 */
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { decide as gateDecide } from "../../dist/hooks/gate.js";
import { decide as bannerDecide } from "../../dist/hooks/banner.js";
import { decide as nudgeDecide } from "../../dist/hooks/nudge.js";
import { normalizeEvent } from "../../dist/lib/event.js";
import type { NormalizedEvent, NormalizedDecision } from "../../dist/types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, "../../dist");

/** OpenCode tool.execute.before/after payload -> normalized event (pure, unit-testable). */
export function toEvent(
  kind: "pre" | "post",
  tool: string,
  args: Record<string, any>,
  directory: string,
  sessionID: string,
): NormalizedEvent {
  const t = tool.toLowerCase();
  let raw: Record<string, unknown>;
  if (["write", "edit", "patch"].includes(t)) {
    raw = {
      kind: kind === "pre" ? "tool.execute.before" : "tool.execute.after",
      tool: t,
      args,
      directory,
      sessionID,
    };
  } else if (["bash", "shell"].includes(t) && kind === "pre") {
    raw = { kind: "tool.execute.before", tool: t, args, directory, sessionID };
  } else {
    raw = { kind: "ignore", tool: t, args, directory, sessionID };
  }
  return normalizeEvent("opencode", raw);
}

export const UltraspecPlugin = async ({ directory }: { directory: string }) => {
  const bannerText = (): string => {
    const ev = normalizeEvent("opencode", { kind: "session.start", directory, sessionID: "" });
    const d: NormalizedDecision = bannerDecide(directory, ev);
    return d.context ?? "";
  };

  return {
    "tool.execute.before": async (input: { tool: string; sessionID: string }, output: { args: any }) => {
      const ev = toEvent("pre", input.tool, output.args ?? {}, directory, input.sessionID);
      if (ev.event === "ignore") return;
      const d = gateDecide(directory, ev);
      if (d.decision === "deny") {
        throw new Error(`[ultraspec] ${d.reason ?? "azione bloccata dalla fase corrente del workflow"}`);
      }
    },

    "tool.execute.after": async (input: { tool: string; sessionID: string; args: any }) => {
      const ev = toEvent("post", input.tool, input.args ?? {}, directory, input.sessionID);
      if (ev.event === "ignore") return;
      nudgeDecide(directory, ev); // fire-and-forget; never blocks
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
  const ok = fs.existsSync(path.join(DIST, "hooks", "gate.js"));
  console.log(ok ? "core hooks reachable" : "core hooks MISSING");
  process.exit(ok ? 0 : 1);
}
