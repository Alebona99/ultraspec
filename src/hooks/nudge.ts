import { resolveEnv, readState, logSession } from "../lib/state.js";
import { missingArtifacts } from "../lib/context.js";
import { relPath, emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  try {
    const env = resolveEnv(event.cwd ?? cwd);
    if (!env) return emit("allow");
    const { state, valid } = readState(env);
    if (!valid || !state) return emit("allow");
    const rel = event.target_path ? relPath(env, event.target_path) : "?";
    logSession(env, "post_write", `scrittura: ${rel}`, event.session_id ?? undefined);
    const missing = missingArtifacts(env, state, state.phase);
    if (missing.length)
      return emit(
        "nudge",
        "",
        `Fase '${state.phase}': artefatti ancora mancanti per il gate: ${missing.join(", ")}.`
      );
    return emit("allow");
  } catch (err) {
    // Fail-open: never throw, always allow
    return emit("allow", `error in nudge: ${err instanceof Error ? err.message : String(err)}`);
  }
}
