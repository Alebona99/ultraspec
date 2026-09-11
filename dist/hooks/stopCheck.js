import { resolveEnv, readState } from "../lib/state.js";
import { stopDecision } from "../lib/context.js";
import { emit } from "../lib/decision.js";
export function decide(cwd, event) {
    const env = resolveEnv(event.cwd ?? cwd);
    if (!env)
        return emit("allow");
    const { state, valid } = readState(env);
    if (!valid || !state)
        return emit("allow");
    if (event.event === "stop" || event.event === "pre_compact")
        return stopDecision(env, state, event.event);
    return emit("allow", `event not gated: ${event.event}`);
}
