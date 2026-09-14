import { resolveEnv, readState } from "../lib/state.js";
import { decidePreWrite, decidePreBash, emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  const env = resolveEnv(event.cwd ?? cwd);
  if (!env) return emit("allow", "no ultraspec root");
  const { state, valid } = readState(env);
  if (!valid || !state) return emit("allow", "no active workflow");
  if (event.event === "pre_write" && event.target_path)
    return decidePreWrite(env, state, event.target_path);
  if (event.event === "pre_bash" && event.command)
    return decidePreBash(env, state, event.command);
  return emit("allow", `event not gated: ${event.event}`);
}
