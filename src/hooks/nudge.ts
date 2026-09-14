import { resolveEnv, readState, logSession } from "../lib/state.js";
import { missingArtifacts } from "../lib/context.js";
import { relPath, emit } from "../lib/decision.js";
import type { NormalizedEvent, NormalizedDecision } from "../types.js";

export function decide(cwd: string, event: NormalizedEvent): NormalizedDecision {
  const env = resolveEnv(event.cwd ?? cwd);
  if (!env) return emit("allow");
  const { state, valid } = readState(env);
  if (!valid || !state) return emit("allow");
  const rel = event.target_path ? relPath(env, event.target_path) : "?";
  try {
    logSession(env, "post_write", `scrittura: ${rel}`, event.session_id ?? undefined);
  } catch (err) {
    // Fail-open: swallow state-write errors, still evaluate nudge
  }
  const missing = missingArtifacts(env, state, state.phase);
  if (missing.length)
    return emit(
      "nudge",
      "",
      `Fase '${state.phase}': artefatti ancora mancanti per il gate: ${missing.join(", ")}.`
    );
  return emit("allow");
}
