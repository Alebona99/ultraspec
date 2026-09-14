import * as fs from "node:fs";
import * as path from "node:path";
import { cfg, nowIso, readState, writeState } from "../lib/state.js";
function gatesFromConfig(env) {
    const out = {};
    for (const [key, value] of Object.entries(env.config.gates)) {
        out[key] = { requires: value.requires, requires_approval: value.requires_approval, human_approved: false };
    }
    return out;
}
export function cmdStart(env, args) {
    const name = args[0] ?? "";
    const rest = args.slice(1);
    let track = "";
    let harness = "";
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--track") {
            track = rest[i + 1] ?? "";
            i++;
        }
        else if (a === "--harness") {
            harness = rest[i + 1] ?? "";
            i++;
        }
        else
            throw new Error(`opzione sconosciuta: ${a}`);
    }
    if (!name)
        throw new Error("manca il nome del workflow");
    if (track !== "greenfield" && track !== "brownfield") {
        throw new Error("track mancante o non valido: usa --track greenfield|brownfield");
    }
    const { state: existing, valid } = readState(env);
    if (valid && existing) {
        throw new Error(`esiste già un workflow attivo: ${existing.workflow} (fase ${existing.phase}). Chiudilo con /ultraspec:archive o usa un git worktree.`);
    }
    const workflowsDir = cfg(env, "workflows_dir", "ultraspec/workflows");
    const reldir = `${workflowsDir}/${name}`;
    fs.mkdirSync(path.join(env.root, reldir), { recursive: true });
    const now = nowIso();
    const state = {
        workflow: name,
        track: track,
        phase: "intake",
        phases_done: [],
        harness: harness ? harness : null,
        artifacts_dir: reldir,
        gates: gatesFromConfig(env),
        session_log: [],
        last_handoff_at: null,
        last_session_id: null,
        last_session_at: null,
        nudge_marker: null,
        history: [{ at: now, event: "start", from: null, to: "intake" }],
    };
    writeState(env, state);
    return `workflow "${name}" avviato — track=${track}, fase=intake, artefatti in ${reldir}/\nProssimo: /ultraspec:discover\n`;
}
