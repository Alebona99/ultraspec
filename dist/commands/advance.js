import { appendHistory, patchState, readState, stateActive } from "../lib/state.js";
import { missingArtifacts } from "../lib/context.js";
const NO_ACTIVE = "nessun workflow attivo (usa: /ultraspec:start <nome> --track ...)";
function phaseAfter(env, phase) {
    const idx = env.config.phase_order.indexOf(phase);
    if (idx === -1)
        return undefined;
    return env.config.phase_order[idx + 1];
}
export function cmdAdvance(env, args) {
    if (!stateActive(env))
        throw new Error(NO_ACTIVE);
    const { state } = readState(env);
    const s = state;
    const cur = s.phase;
    const nxt = phaseAfter(env, cur);
    if (!nxt)
        throw new Error(`sei già alla fase finale ('${cur}')`);
    const missing = missingArtifacts(env, s, cur);
    if (missing.length) {
        throw new Error(`avanzamento rifiutato: mancano gli artefatti del gate '${cur}': ${missing.join(", ")}`);
    }
    if (env.config.gates[cur]?.requires_approval === true) {
        if (s.gates[cur]?.human_approved !== true) {
            throw new Error(`avanzamento rifiutato: il gate '${cur}' richiede l'approvazione dell'utente (/ultraspec:approve ${cur}). /ultraspec:advance non approva.`);
        }
    }
    patchState(env, (st) => ({
        ...st,
        phases_done: st.phases_done.includes(cur) ? st.phases_done : [...st.phases_done, cur],
        phase: nxt,
        nudge_marker: null,
    }));
    appendHistory(env, { event: "advance", from: cur, to: nxt });
    return `avanzato: ${cur} -> ${nxt}\n`;
}
