import { resolveEnv, readState } from "../lib/state.js";
import { stopDecision } from "../lib/context.js";
import { emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  try {
    const env = resolveEnv(event.cwd ?? cwd);
    if (!env) return emit("allow");
    const { state, valid } = readState(env);
    if (!valid || !state) return emit("allow");
    if (event.event === "stop" || event.event === "pre_compact")
      return stopDecision(env, state, event.event);
    return emit("allow", `event not gated: ${event.event}`);
  } catch (err) {
    // Fail-open: never throw, always allow
    return emit("allow", `error in stopCheck: ${err instanceof Error ? err.message : String(err)}`);
  }
}
