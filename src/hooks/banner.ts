import { resolveEnv, readState, patchState, nowIso } from "../lib/state.js";
import { phaseBanner, phaseBannerShort } from "../lib/context.js";
import { emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  try {
    const env = resolveEnv(event.cwd ?? cwd);
    if (!env) return emit("allow");
    const { state, valid } = readState(env);
    if (!valid || !state) return emit("allow");
    let banner: string;
    if (event.event === "user_prompt") {
      banner = phaseBannerShort(env, state);
    } else {
      banner = phaseBanner(env, state);
      patchState(env, (s) => ({
        ...s,
        last_session_at: nowIso(),
        last_session_id: event.session_id || s.last_session_id,
      }));
    }
    return banner ? emit("allow", "", banner) : emit("allow");
  } catch (err) {
    // Fail-open: never throw, always allow
    return emit("allow", `error in banner: ${err instanceof Error ? err.message : String(err)}`);
  }
}
