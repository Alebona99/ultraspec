import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { UsEnv } from "../types.js";
import { cfg, readState, stateActive } from "../lib/state.js";
import { gateApproved, missingArtifacts } from "../lib/context.js";
import { phaseAllowsCode } from "../lib/decision.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// adapters/SUPPORT.md ships in the npm package root (see package.json "files"),
// not copied into the host project by `init` — resolve it relative to this
// compiled module's own location (dist/commands/status.js -> package root),
// same pattern src/cli.ts and src/init.ts use for packageRoot.
function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

export function enforcementLevel(env: UsEnv, harness: string | null): string {
  if (!harness) return "sconosciuto";
  const f = path.join(packageRoot(), "adapters", "SUPPORT.md");
  if (!fs.existsSync(f)) return "sconosciuto";
  const content = fs.readFileSync(f, "utf8");
  const re = new RegExp(`^\\| *${escapeRegExp(harness)} *\\|`, "i");
  const line = content.split("\n").find((l) => re.test(l));
  if (!line) return "solo fallback git (adapter non elencato)";
  const xCount = (line.match(/X/g) || []).length;
  if (xCount >= 4) return "completo (write + commit + contesto + turn-end)";
  if (xCount >= 2) return "parziale (vedi adapters/SUPPORT.md)";
  return "minimo (solo fallback git)";
}

export function cmdStatus(env: UsEnv, args: string[]): string {
  if (!stateActive(env)) {
    return "nessun workflow attivo. Avvia con: /ultraspec:start <nome> --track greenfield|brownfield\n";
  }
  const { state } = readState(env);
  const s = state!;
  const ph = s.phase;
  const harness = s.harness;
  const enforce = enforcementLevel(env, harness);

  if (args[0] === "--json") {
    const missing = missingArtifacts(env, s, ph);
    return JSON.stringify(
      {
        workflow: s.workflow,
        track: s.track,
        phase: s.phase,
        phases_done: s.phases_done,
        missing_artifacts: missing,
        gates: s.gates,
        harness: s.harness,
        enforcement: enforce,
      },
      null,
      2
    ) + "\n";
  }

  const lines: string[] = [];
  lines.push(`workflow : ${s.workflow}`);
  lines.push(`track    : ${s.track}`);
  lines.push(`fase     : ${ph}   (fatte: ${s.phases_done.join(", ")})`);
  lines.push(`harness  : ${harness || "?"}   enforcement: ${enforce}`);

  const missing = missingArtifacts(env, s, ph);
  if (missing.length) {
    lines.push(`gate     : mancano ${missing.join(", ")}`);
  } else if (env.config.gates[ph]) {
    if (gateApproved(env, s, ph)) lines.push("gate     : soddisfatto — /ultraspec:advance");
    else lines.push(`gate     : artefatti pronti, manca /ultraspec:approve ${ph}`);
  } else {
    lines.push("gate     : nessun gate per questa fase — /ultraspec:advance");
  }

  if (!phaseAllowsCode(env, s)) {
    const from = cfg(env, "code_edit_allowed_from", "build");
    const allowed = env.config.commit_allowed_phases.join(", ");
    lines.push(`blocco   : modifiche a codice di prodotto bloccate fino alla fase "${from}"; commit consentito in ${allowed}`);
  }

  return lines.join("\n") + "\n";
}
