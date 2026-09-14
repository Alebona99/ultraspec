import * as fs from "node:fs";
import * as path from "node:path";
import type { UsEnv, UsState, NormalizedDecision } from "../types.js";
import { cfg, patchState, nowIso } from "./state.js";
import { emit, phaseAllowsCode } from "./decision.js";

export function artifactsDirAbs(env: UsEnv, state: UsState): string {
  const d = state.artifacts_dir || `${cfg(env, "workflows_dir", "ultraspec/workflows")}/${state.workflow}`;
  return d.startsWith("/") ? d : path.join(env.root, d);
}

export function missingArtifacts(env: UsEnv, state: UsState, phase: string): string[] {
  const dir = artifactsDirAbs(env, state);
  const required = env.config.gates[phase]?.requires ?? [];
  return required.filter((f) => !fs.existsSync(path.join(dir, f)));
}

export function gateApproved(env: UsEnv, state: UsState, phase: string): boolean {
  const gateCfg = env.config.gates[phase];
  if (!gateCfg?.requires_approval) return true;
  return state.gates[phase]?.human_approved === true;
}

export function phaseBannerShort(env: UsEnv, state: UsState): string {
  const { phase, workflow, track } = state;
  const from = cfg(env, "code_edit_allowed_from", "build");
  const allowed = env.config.commit_allowed_phases.join(", ");
  const nextcmd = env.config.phase_commands[phase];
  const lines: string[] = [`[ultraspec] workflow=${workflow}  track=${track}  phase=${phase}`];
  if (phaseAllowsCode(env, state)) lines.push("Modifiche a codice: CONSENTITE in questa fase.");
  else lines.push(`BLOCCATO in questa fase: modifiche a codice di prodotto (fino alla fase "${from}") e git commit/push (consentiti in: ${allowed}).`);
  if (nextcmd) {
    lines.push(`Comando di fase: /ultraspec:${nextcmd}   (stato completo: /ultraspec:status)`);
    if (["discover", "spec", "plan", "build", "review", "archive"].includes(nextcmd)) {
      lines.push(`Azione: se non l'hai già svolta in questa sessione, esegui la procedura ultraspec/workflow/${nextcmd}.md, poi fermati al gate (artefatto + eventuale /ultraspec:approve). Non eseguire advance/approve da solo.`);
    }
  }
  const missing = missingArtifacts(env, state, phase);
  if (missing.length) lines.push(`Gate: mancano ${missing.join(", ")}`);
  else if (env.config.gates[phase]) {
    lines.push(gateApproved(env, state, phase) ? "Gate: soddisfatto — /ultraspec:advance" : `Gate: artefatti pronti, manca /ultraspec:approve ${phase}`);
  }
  return lines.join("\n");
}

export function sessionLogSummary(state: UsState): string {
  if (!state.session_log.length) return "";
  const tail = state.session_log.slice(-8);
  const lines = ["", "--- Attività recente (machine log, ultime voci) ---", ...tail.map((e) => `- ${e.event}: ${e.note}`), "Nessun /ultraspec:handoff scritto per questa sessione."];
  return lines.join("\n");
}

export function latestHandoff(env: UsEnv, state: UsState): string | null {
  const dir = path.join(env.root, cfg(env, "handoffs_dir", "ultraspec/handoffs"));
  if (!fs.existsSync(dir)) return null;
  const prefix = `${state.workflow}-`;
  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(dir, files[0].f) : null;
}

export function recentHandoffBlob(env: UsEnv, state: UsState): string {
  const hf = latestHandoff(env, state);
  if (hf) {
    const hfEpoch = fs.statSync(hf).mtimeMs;
    const lastAt = state.last_session_at ? Date.parse(state.last_session_at) : 0;
    if (hfEpoch >= lastAt) {
      return `\n--- Handoff dalla sessione precedente (${path.basename(hf)}) ---\n${fs.readFileSync(hf, "utf8")}\n--- fine handoff ---\n`;
    }
  }
  return sessionLogSummary(state);
}

export function memoryBlob(env: UsEnv): string {
  if (!env.config.memory?.enabled) return "";
  const mf = path.join(env.root, cfg(env, "memory_dir", "ultraspec/memory"), "MEMORY.md");
  if (!fs.existsSync(mf)) return "";
  return `\n--- ultraspec project memory ---\n${fs.readFileSync(mf, "utf8")}\n--- fine memory ---\n`;
}

export function phaseBanner(env: UsEnv, state: UsState): string {
  return [phaseBannerShort(env, state), recentHandoffBlob(env, state), memoryBlob(env)].filter(Boolean).join("\n");
}

export function stopDecision(env: UsEnv, state: UsState, event: "stop" | "pre_compact"): NormalizedDecision {
  if (event === "stop" && env.config.stop_gated_phases.includes(state.phase)) {
    const missing = missingArtifacts(env, state, state.phase);
    if (missing.length) return emit("block", `Fase '${state.phase}' non completata: manca ${missing.join(", ")}. Completa la fase prima di chiudere il turno.`);
  }
  const threshold = cfg(env, "handoff", { nudge_threshold: 15 }).nudge_threshold || 15;
  const since = state.session_log.filter((e) => e.event === "post_write").length;
  const bucket = Math.floor(since / threshold);
  if (bucket >= 1 && state.nudge_marker !== bucket) {
    try {
      patchState(env, (s) => ({ ...s, nudge_marker: bucket }));
    } catch {
      // Silently swallow patchState errors (e.g. filesystem issues);
      // nudge emission proceeds regardless of persistence success
    }
    return emit("nudge", `Molto lavoro dall'ultimo handoff (${since} scritture). Scrivi /ultraspec:handoff prima di chiudere o compattare, così la prossima sessione riparte pulita.`);
  }
  return emit("allow", `nothing to gate at ${event}`);
}
